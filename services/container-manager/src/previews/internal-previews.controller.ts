import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PreviewService } from './preview.service';
import { InternalServiceAuthGuard } from '../guards/internal-service-auth.guard';

/**
 * InternalPreviewsController
 * Task 7.3A: Preview Port Registration (Internal Only)
 *
 * Internal-only endpoints for preview port management
 * Protected by X-Internal-Service-Key authentication
 */
@Controller('internal/sessions')
@UseGuards(InternalServiceAuthGuard)
export class InternalPreviewsController {
  constructor(private previewService: PreviewService) {}

  /**
   * POST /api/internal/sessions/:id/previews
   * Register a preview port for a session container
   *
   * Behavior:
   * 1. Validate sessionId exists
   * 2. Validate port is positive integer (>= 1024 && <= 65535)
   * 3. Validate container for session is running
   * 4. Register the port mapping internally (in-memory)
   * 5. Return confirmation
   *
   * Request body:
   * - port (required): Container port number (1024-65535)
   *
   * Response:
   * - sessionId: The session ID
   * - port: The registered port
   * - registered: true
   *
   * Errors:
   * - 400 Bad Request: Invalid or missing port
   * - 403 Forbidden: Missing or invalid X-Internal-Service-Key
   * - 500 Internal Server Error: Container not running or not found
   */
  @Post(':id/previews')
  @HttpCode(HttpStatus.OK)
  async registerPreviewPort(
    @Param('id') sessionId: string,
    @Body('port') port?: number,
  ): Promise<{ sessionId: string; port: number; registered: true }> {
    // Validate port is provided
    if (port === undefined || port === null) {
      throw new BadRequestException('Request body field "port" is required');
    }

    // Validate port is a number
    if (typeof port !== 'number') {
      throw new BadRequestException('Port must be a number');
    }

    return this.previewService.registerPreviewPort(sessionId, port);
  }
}
