import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * InternalServiceAuthGuard
 * Protects /api/internal/* routes with shared secret authentication
 * Task 5.2A: Internal Service Authentication
 *
 * Design:
 * - Checks X-Internal-Service-Key header
 * - Compares to INTERNAL_SERVICE_KEY env variable
 * - Returns 401 Unauthorized if missing/invalid (no detailed leak)
 * - Only applies to routes matching /api/internal/*
 * - All other routes bypass this guard
 */
@Injectable()
export class InternalServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalServiceAuthGuard.name);
  private readonly internalServiceKey: string | undefined;

  constructor() {
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY;

    if (!this.internalServiceKey) {
      this.logger.warn(
        '⚠️  INTERNAL_SERVICE_KEY not set. Internal API endpoints are UNPROTECTED.',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    // Only apply to /api/internal/* routes
    if (!path.startsWith('/api/internal/')) {
      return true; // Bypass guard for non-internal routes
    }

    // If no key is configured, DENY access to internal routes
    if (!this.internalServiceKey) {
      this.logger.error(
        `Internal route access denied: ${path} (INTERNAL_SERVICE_KEY not configured)`,
      );
      throw new UnauthorizedException('Unauthorized');
    }

    // Check X-Internal-Service-Key header
    const providedKey = request.headers['x-internal-service-key'];

    if (!providedKey) {
      this.logger.warn(`Internal route access denied: ${path} (missing header)`);
      throw new UnauthorizedException('Unauthorized');
    }

    if (providedKey !== this.internalServiceKey) {
      this.logger.warn(`Internal route access denied: ${path} (invalid key)`);
      throw new UnauthorizedException('Unauthorized');
    }

    // Valid key - allow access
    this.logger.debug(`Internal route access granted: ${path}`);
    return true;
  }
}
