import {
  Controller,
  All,
  Get,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { PreviewProxyService } from './preview-proxy.service';
import { SessionsService } from '../sessions/sessions.service';

/**
 * PreviewsController
 * Task 7.3C: Expose Previews Publicly (Safe Preview Routing)
 * Task 7.4A: Preview Access Control
 * Task 7.4B: Preview Health Check Endpoint
 * Task 7.4C: WebSocket / Upgrade Support for Previews
 *
 * Public HTTP proxy for forwarding traffic to session container previews.
 * Route: /previews/:sessionId/*
 *
 * This is a public-facing endpoint that reuses the preview proxy service
 * from Task 7.3B for validation and target resolution.
 *
 * Access Control (Task 7.4A):
 * - When ENABLE_PREVIEW_ACCESS_CONTROL=true:
 *   - Validates JWT from Authorization header
 *   - Checks user owns the session
 *   - Returns 401 for missing/invalid JWT
 *   - Returns 403 for unauthorized access
 * - When ENABLE_PREVIEW_ACCESS_CONTROL=false:
 *   - Public access (default behavior)
 *
 * Health Check (Task 7.4B):
 * - GET /previews/:sessionId/health
 * - Returns preview service health status
 *
 * WebSocket Support (Task 7.4C):
 * - Proxies WebSocket upgrade requests
 * - Supports dev server HMR (Vite, Next.js, CRA)
 * - Preserves path rewriting for WebSocket connections
 */
@Controller('previews')
export class PreviewsController {
  private readonly accessControlEnabled: boolean;
  private readonly jwtSecret: string;

  constructor(
    private previewProxyService: PreviewProxyService,
    private sessionsService: SessionsService,
  ) {
    // Load access control configuration from environment
    this.accessControlEnabled =
      process.env.ENABLE_PREVIEW_ACCESS_CONTROL === 'true';
    this.jwtSecret =
      process.env.JWT_SECRET ||
      'change_this_in_production_use_a_long_random_string';

    if (this.accessControlEnabled) {
      console.log('✓ Preview access control ENABLED');
    } else {
      console.log('⚠ Preview access control DISABLED (public access)');
    }
  }

  /**
   * Health check endpoint for preview service
   * Task 7.4B: Preview Health Check Endpoint
   * Task 8.4A: Enforce Session Termination (HTTP 410)
   *
   * GET /previews/:sessionId/health
   *
   * Behavior:
   * 1. Validate session is not terminated (410 if terminated)
   * 2. Validate preview port is registered (404 if not)
   * 3. Validate container is running (500 if not)
   * 4. Attempt HTTP connection to preview service
   * 5. Return health status
   *
   * Response (healthy):
   * {
   *   "healthy": true,
   *   "sessionId": "abc123",
   *   "port": 3000,
   *   "statusCode": 200
   * }
   *
   * Response (unhealthy):
   * {
   *   "healthy": false,
   *   "sessionId": "abc123",
   *   "port": 3000,
   *   "error": "Connection failed"
   * }
   *
   * Error handling:
   * - 404 Not Found: Session does not exist or no preview port registered
   * - 410 Gone: Session has been terminated
   * - 500 Internal Server Error: Container not running
   */
  @Get(':sessionId/health')
  @HttpCode(HttpStatus.OK)
  async checkHealth(@Param('sessionId') sessionId: string) {
    try {
      // Task 8.4A: Check session termination FIRST (DB-backed via SessionsService)
      this.sessionsService.assertSessionUsable(sessionId);

      // Get proxy target (validates registration and container running)
      const target = await this.previewProxyService.getProxyTarget(sessionId);

      // Extract port from target URL
      const urlMatch = target.match(/:(\d+)$/);
      const port = urlMatch ? parseInt(urlMatch[1], 10) : null;

      // Attempt connection to preview service
      try {
        const response = await axios.get(target, {
          timeout: 5000, // 5 second timeout
          validateStatus: () => true, // Accept any status code
        });

        return {
          healthy: true,
          sessionId,
          port,
          statusCode: response.status,
        };
      } catch (error) {
        // Connection failed
        return {
          healthy: false,
          sessionId,
          port,
          error:
            error.code === 'ECONNREFUSED'
              ? 'Connection refused'
              : 'Connection failed',
        };
      }
    } catch (error) {
      // Preview not registered or container not running
      // Re-throw to let existing error handling format the response
      throw error;
    }
  }

  /**
   * Proxy all HTTP methods to registered container preview port
   * Task 7.4C: Includes WebSocket / HTTP upgrade support
   * Task 8.4A: Enforce Session Termination (HTTP 410)
   *
   * Public endpoint for accessing session container web applications.
   *
   * Behavior:
   * 1. Check session is not terminated (410 if terminated)
   * 2. [Optional] Check JWT and session ownership if access control enabled
   * 3. Look up registered port for sessionId (validates registration)
   * 4. Get container IP from Docker (validates container is running)
   * 5. Proxy request to http://containerIP:port
   * 6. Support WebSocket upgrades for dev servers (Vite, Next.js, etc.)
   *
   * WebSocket Support:
   * - Detects Upgrade: websocket header
   * - Proxies WebSocket traffic to same container IP + port
   * - Preserves path rewriting for WebSocket connections
   * - Works with Vite HMR, Next.js Fast Refresh, CRA dev server
   *
   * Error handling:
   * - 404 Not Found: Session does not exist or no preview port registered
   * - 410 Gone: Session has been terminated
   * - 401 Unauthorized: Missing or invalid JWT (when access control enabled)
   * - 403 Forbidden: User does not own session (when access control enabled)
   * - 500 Internal Server Error: Container not running
   * - 502 Bad Gateway: Proxy connection failed
   *
   * Security:
   * - Access control configurable via ENABLE_PREVIEW_ACCESS_CONTROL
   * - Access control enforced for both HTTP and WebSocket
   * - Session isolation enforced via Docker networking
   * - Only forwards to registered preview ports
   */
  @All(':sessionId/*')
  async proxyToContainer(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Task 8.4A: Check session termination FIRST (DB-backed via SessionsService)
      this.sessionsService.assertSessionUsable(sessionId);

      // Check access control if enabled
      if (this.accessControlEnabled) {
        await this.enforceAccessControl(req, sessionId);
      }

      // Get proxy target using existing service
      // This validates:
      // - Preview port is registered (throws 404 if not)
      // - Container exists and is running (throws 500 if not)
      const target = await this.previewProxyService.getProxyTarget(sessionId);

      // Create proxy middleware dynamically
      const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying (Task 7.4C)
        pathRewrite: (path) => {
          // Remove /previews/:sessionId from the path
          const prefix = `/previews/${sessionId}`;
          return path.replace(prefix, '') || '/';
        },
        on: {
          proxyReqWs: (proxyReq, req, socket) => {
            // Log WebSocket upgrade requests
            console.log(
              `[Public Preview] WebSocket upgrade for session ${sessionId}`,
            );
          },
          error: (err, req, res) => {
            console.error(
              `[Public Preview] Proxy error for session ${sessionId}:`,
              err.message,
            );

            // Check if res is ServerResponse (not Socket for WebSocket)
            if (res && 'writeHead' in res && 'headersSent' in res) {
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    statusCode: 502,
                    message: 'Bad Gateway',
                    error: 'Failed to connect to preview server',
                  }),
                );
              }
            }
          },
        },
      });

      // Apply proxy
      proxy(req, res);
    } catch (error) {
      // Handle 401, 403, 404, and 500 errors
      if (!res.headersSent) {
        const statusCode = error.status || 500;
        res.status(statusCode).json({
          statusCode,
          message: error.message,
          error: error.name,
        });
      }
    }
  }

  /**
   * Enforce JWT-based access control
   * Task 7.4A: Preview Access Control
   *
   * Validates:
   * 1. JWT is present in Authorization header
   * 2. JWT is valid and not expired
   * 3. User from JWT owns the requested session
   *
   * @throws UnauthorizedException if JWT missing or invalid
   * @throws ForbiddenException if user does not own session
   */
  private async enforceAccessControl(
    req: Request,
    sessionId: string,
  ): Promise<void> {
    // Extract JWT from Authorization header
    const token = this.extractJwtFromRequest(req);

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    // Verify and decode JWT
    let userId: string;
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      userId = decoded.sub || decoded.userId;

      if (!userId) {
        throw new UnauthorizedException('Invalid token payload');
      }
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      throw new UnauthorizedException('Token verification failed');
    }

    // Check session ownership
    const hasAccess = await this.checkSessionOwnership(sessionId, userId);

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have permission to access this preview',
      );
    }
  }

  /**
   * Extract JWT token from Authorization header
   *
   * Supports:
   * - Bearer token format: "Bearer <token>"
   *
   * @returns JWT token string or null if not found
   */
  private extractJwtFromRequest(req: Request): string | null {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return null;
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }

    return null;
  }

  /**
   * Check if user owns the session
   *
   * @param sessionId - Session ID to check
   * @param userId - User ID from JWT
   * @returns true if user owns session, false otherwise
   */
  private async checkSessionOwnership(
    sessionId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const session = await this.sessionsService.getSession(sessionId);

      // Session data has user_id field
      return session.user_id === userId;
    } catch (error) {
      // Session not found or other error
      console.error(
        `Error checking session ownership for ${sessionId}:`,
        error.message,
      );
      return false;
    }
  }
}
