import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * InternalServiceAuthGuard
 * Protects internal endpoints with shared secret authentication
 * Task 6.5: Explicit Container Deletion
 *
 * Design:
 * - Checks X-Internal-Service-Key header
 * - Compares to INTERNAL_SERVICE_KEY env variable
 * - Returns 403 Forbidden if missing/invalid
 * - Application fails to start if INTERNAL_SERVICE_KEY not configured
 */
@Injectable()
export class InternalServiceAuthGuard implements CanActivate {
  private readonly internalServiceKey: string;

  constructor() {
    const key = process.env.INTERNAL_SERVICE_KEY;

    if (!key) {
      throw new Error(
        'FATAL: INTERNAL_SERVICE_KEY environment variable is not set. Application cannot start without internal service authentication configured.',
      );
    }

    this.internalServiceKey = key;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-internal-service-key'];

    if (!providedKey || providedKey !== this.internalServiceKey) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}
