import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PreviewService } from './preview.service';
import { DockerRuntimeService } from '../docker/docker-runtime.service';

/**
 * PreviewProxyService (Phase 7.3)
 * Task 7.3B: Preview Proxy Skeleton (Internal Only)
 *
 * Provides proxy target resolution for preview requests.
 * Resolves sessionId -> container IP + registered port.
 */
@Injectable()
export class PreviewProxyService {
  constructor(
    private previewService: PreviewService,
    private dockerRuntimeService: DockerRuntimeService,
  ) {}

  /**
   * Get proxy target URL for a session
   *
   * @param sessionId - The session ID
   * @returns Target URL in format http://containerIP:port
   * @throws NotFoundException if no port registered for session
   * @throws InternalServerErrorException if container not running or unreachable
   */
  async getProxyTarget(sessionId: string): Promise<string> {
    // Check if port is registered
    const port = this.previewService.getRegisteredPort(sessionId);

    if (!port) {
      throw new NotFoundException(
        `No preview port registered for session ${sessionId}`,
      );
    }

    // Get container IP
    const containerIp = await this.getContainerIp(sessionId);

    return `http://${containerIp}:${port}`;
  }

  /**
   * Get container IP address from Docker
   *
   * @param sessionId - The session ID
   * @returns Container IP address
   * @throws InternalServerErrorException if container not found or not running
   */
  private async getContainerIp(sessionId: string): Promise<string> {
    try {
      // Find container by session ID
      const container =
        await this.dockerRuntimeService.findContainerBySessionId(sessionId);

      // Inspect container to get network info
      const inspect = await container.inspect();

      // Verify container is running
      if (!inspect.State.Running) {
        throw new InternalServerErrorException(
          `Container for session ${sessionId} is not running`,
        );
      }

      // Get IP from default bridge network
      const networks = inspect.NetworkSettings.Networks;
      const networkNames = Object.keys(networks);

      if (networkNames.length === 0) {
        throw new InternalServerErrorException(
          `Container for session ${sessionId} has no network configuration`,
        );
      }

      // Try to get IP from first available network
      const firstNetwork = networks[networkNames[0]];
      const ipAddress = firstNetwork.IPAddress;

      if (!ipAddress) {
        throw new InternalServerErrorException(
          `Container for session ${sessionId} has no IP address`,
        );
      }

      return ipAddress;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      // Container not found or other docker error
      throw new InternalServerErrorException(
        `Failed to get container IP for session ${sessionId}: ${error.message}`,
      );
    }
  }
}
