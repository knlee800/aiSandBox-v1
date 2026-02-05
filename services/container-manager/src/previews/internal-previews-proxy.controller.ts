import { Controller, All, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { PreviewProxyService } from './preview-proxy.service';

/**
 * InternalPreviewsProxyController
 * Task 7.3B: Preview Proxy Skeleton (Internal Only)
 *
 * Internal-only HTTP proxy for forwarding traffic to session containers.
 * Route: /internal-previews/proxy/:sessionId/*
 *
 * No authentication guard - this is internal traffic only.
 */
@Controller('internal-previews/proxy')
export class InternalPreviewsProxyController {
  constructor(private previewProxyService: PreviewProxyService) {}

  /**
   * Proxy all HTTP methods to registered container preview port
   *
   * Behavior:
   * 1. Look up registered port for sessionId
   * 2. Get container IP from Docker
   * 3. Proxy request to http://containerIP:port
   *
   * Error handling:
   * - 404 Not Found: No port registered for session
   * - 500 Internal Server Error: Container not running
   * - 502 Bad Gateway: Proxy connection failed
   */
  @All(':sessionId/*')
  async proxyToContainer(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Get proxy target (throws 404 if not registered, 500 if not running)
      const target = await this.previewProxyService.getProxyTarget(sessionId);

      // Create proxy middleware dynamically
      const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: (path) => {
          // Remove /internal-previews/proxy/:sessionId from the path
          const prefix = `/internal-previews/proxy/${sessionId}`;
          return path.replace(prefix, '') || '/';
        },
        on: {
          error: (err, req, res) => {
            console.error(
              `Proxy error for session ${sessionId}:`,
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
      // Handle 404 and 500 errors from getProxyTarget
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
}
