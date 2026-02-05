import { Injectable, OnModuleInit } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import Docker from 'dockerode';
import { GovernanceConfig } from '../config/governance.config';

/**
 * DockerRuntimeService
 * Manages Docker container lifecycle for sandbox sessions
 * Each session gets one isolated Docker container
 *
 * Task 8.1B: Enforces Docker resource limits at container creation
 */
@Injectable()
export class DockerRuntimeService implements OnModuleInit {
  private docker: Docker;

  constructor(private governanceConfig: GovernanceConfig) {
    // Initialize Docker client with DOCKER_HOST from environment
    const dockerHost = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock';

    this.docker = new Docker({
      socketPath: dockerHost.startsWith('unix://')
        ? dockerHost.replace('unix://', '')
        : undefined,
      host: dockerHost.startsWith('tcp://') ? dockerHost.replace('tcp://', '') : undefined,
    });
  }

  /**
   * Verify Docker daemon connectivity on module initialization
   * Fail-fast if Docker is unreachable
   */
  async onModuleInit() {
    try {
      await this.docker.ping();
      console.log('✓ Docker daemon connection verified');
    } catch (error) {
      throw new Error(
        `FATAL: Cannot connect to Docker daemon. Ensure Docker is running and DOCKER_HOST is configured correctly. Error: ${error.message}`,
      );
    }
  }

  /**
   * Create a Docker container for a session
   * Does NOT start the container - use startContainer() separately
   *
   * Task 8.1B: Enforces resource limits from GovernanceConfig
   * - Memory limit (bytes)
   * - CPU limit (NanoCpus)
   * - PIDs limit (max processes)
   *
   * @param sessionId - Unique session identifier
   * @param workspacePath - Absolute path to session workspace on host
   * @returns Container ID
   */
  async createContainer(
    sessionId: string,
    workspacePath: string,
  ): Promise<string> {
    try {
      const containerName = `sandbox-session-${sessionId}`;

      // Get resource limits from governance config (Task 8.1B)
      const memoryBytes = this.governanceConfig.getContainerMemoryLimitBytes();
      const cpuLimit = this.governanceConfig.containerCpuLimit;
      const pidsLimit = this.governanceConfig.containerPidsLimit;

      // Convert CPU limit to NanoCpus (Docker API format)
      // Example: 0.5 CPU cores = 0.5 * 1e9 = 500000000 nanoseconds
      const nanoCpus = Math.floor(cpuLimit * 1e9);

      const container = await this.docker.createContainer({
        name: containerName,
        Image: 'node:20-alpine',
        WorkingDir: '/workspace',
        Cmd: ['/bin/sh', '-c', 'while true; do sleep 3600; done'], // Keep container alive
        HostConfig: {
          Binds: [`${workspacePath}:/workspace:rw`], // Mount session workspace as read-write
          AutoRemove: false, // Explicit removal only
          Memory: memoryBytes, // Task 8.1B: Memory limit
          NanoCpus: nanoCpus, // Task 8.1B: CPU limit
          PidsLimit: pidsLimit, // Task 8.1B: PIDs limit
        },
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
        OpenStdin: false,
      });

      console.log(`✓ Container created: ${containerName} (${container.id})`);
      console.log(`  - Memory limit: ${memoryBytes} bytes (${this.governanceConfig.containerMemoryLimitMb}MB)`);
      console.log(`  - CPU limit: ${cpuLimit} cores (${nanoCpus} nanocpus)`);
      console.log(`  - PIDs limit: ${pidsLimit}`);
      return container.id;
    } catch (error) {
      throw new Error(
        `Failed to create container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * Start a Docker container
   * Blocks until container is running or fails
   *
   * @param containerId - Docker container ID
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new Error('Container failed to reach running state');
      }

      console.log(`✓ Container started: ${containerId}`);
    } catch (error) {
      throw new Error(
        `Failed to start container ${containerId}: ${error.message}`,
      );
    }
  }

  /**
   * Stop a Docker container
   * Waits for graceful shutdown (10 second timeout, then force kill)
   *
   * @param containerId - Docker container ID
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 }); // 10 second graceful shutdown timeout

      console.log(`✓ Container stopped: ${containerId}`);
    } catch (error) {
      // Ignore "container already stopped" errors
      if (error.statusCode === 304) {
        console.log(`✓ Container already stopped: ${containerId}`);
        return;
      }
      throw new Error(
        `Failed to stop container ${containerId}: ${error.message}`,
      );
    }
  }

  /**
   * Remove a Docker container
   * Container must be stopped before removal
   *
   * @param containerId - Docker container ID
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: false }); // Require explicit stop first

      console.log(`✓ Container removed: ${containerId}`);
    } catch (error) {
      // Ignore "container not found" errors
      if (error.statusCode === 404) {
        console.log(`✓ Container not found (already removed): ${containerId}`);
        return;
      }
      throw new Error(
        `Failed to remove container ${containerId}: ${error.message}`,
      );
    }
  }

  /**
   * Find a container by session ID
   * Resolves container using naming convention: sandbox-session-{sessionId}
   *
   * @param sessionId - Session identifier
   * @returns Docker Container instance
   * @throws Error if container not found
   */
  async findContainerBySessionId(sessionId: string): Promise<Docker.Container> {
    try {
      const containerName = `sandbox-session-${sessionId}`;
      const containers = await this.docker.listContainers({ all: true });

      const containerInfo = containers.find((c) =>
        c.Names.includes(`/${containerName}`),
      );

      if (!containerInfo) {
        throw new Error(`Container not found for session ${sessionId}`);
      }

      return this.docker.getContainer(containerInfo.Id);
    } catch (error) {
      throw new Error(
        `Failed to find container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * Execute a command inside a container by session ID
   * Task 7.1A: Internal Container Exec Primitive
   * Task 7.1B: Exec Parity & Hardening
   *
   * @param sessionId - Session identifier
   * @param cmd - Command array (e.g., ["node", "-v"])
   * @param cwd - Working directory (default: /workspace)
   * @param env - Environment variables as key-value pairs
   * @param timeoutMs - Execution timeout in milliseconds (default: 300000)
   * @returns Object with exitCode, stdout, stderr
   * @throws Error if container not found, not running, or exec fails
   */
  async execInContainerBySessionId(
    sessionId: string,
    cmd: string[],
    cwd: string = '/workspace',
    env?: Record<string, string>,
    timeoutMs: number = 300000,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      // Find container by session ID
      const container = await this.findContainerBySessionId(sessionId);

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new Error(`Container for session ${sessionId} is not running`);
      }

      // Ensure cwd defaults to /workspace if empty or undefined
      const workingDir = cwd && cwd.trim() !== '' ? cwd : '/workspace';

      // Convert env object to array format ["KEY=VALUE"]
      // Filter out non-string values for safety
      const envArray = env
        ? Object.entries(env)
            .filter(([_, value]) => typeof value === 'string')
            .map(([key, value]) => `${key}=${value}`)
        : undefined;

      // Create exec instance
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: workingDir,
        Env: envArray,
      });

      // Track timeout ID for cleanup
      let timeoutId: NodeJS.Timeout | undefined;

      // Execute with timeout
      const execPromise = new Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>(async (resolve, reject) => {
        // Guard against duplicate resolve/reject calls
        let settled = false;

        const safeResolve = (result: {
          exitCode: number;
          stdout: string;
          stderr: string;
        }) => {
          if (!settled) {
            settled = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            resolve(result);
          }
        };

        const safeReject = (error: Error) => {
          if (!settled) {
            settled = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            reject(error);
          }
        };

        try {
          const stream = await exec.start({ Detach: false });

          let stdout = '';
          let stderr = '';

          // Dockerode returns a multiplexed stream for exec
          // We need to demultiplex it
          const stdoutStream = new (require('stream').Writable)();
          const stderrStream = new (require('stream').Writable)();

          stdoutStream._write = (
            chunk: Buffer,
            encoding: string,
            callback: () => void,
          ) => {
            stdout += chunk.toString();
            callback();
          };

          stderrStream._write = (
            chunk: Buffer,
            encoding: string,
            callback: () => void,
          ) => {
            stderr += chunk.toString();
            callback();
          };

          // Demultiplex the stream
          container.modem.demuxStream(stream, stdoutStream, stderrStream);

          stream.on('end', async () => {
            try {
              // Inspect exec to get exit code
              const execInspect = await exec.inspect();
              safeResolve({
                exitCode: execInspect.ExitCode ?? 0,
                stdout,
                stderr,
              });
            } catch (error) {
              safeReject(error);
            }
          });

          stream.on('error', safeReject);
        } catch (error) {
          safeReject(error);
        }
      });

      // Enforce timeout with cleanup
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Execution timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      return await Promise.race([execPromise, timeoutPromise]);
    } catch (error) {
      throw new Error(
        `Failed to execute command in container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * Read a file from container filesystem by session ID
   * Task 7.2A: Container File Read (Read-Only)
   * Task 7.2A-1: Invalid Path → 400
   *
   * @param sessionId - Session identifier
   * @param filePath - Relative path from /workspace (e.g., "index.js", "src/app.ts")
   * @returns File content as UTF-8 string
   * @throws BadRequestException if path is invalid
   * @throws Error if container not found, not running, or file read fails
   */
  async readFileFromContainer(
    sessionId: string,
    filePath: string,
  ): Promise<string> {
    try {
      // Validate path safety (throws BadRequestException on invalid path)
      this.validateWorkspacePath(filePath);

      // Find container by session ID
      const container = await this.findContainerBySessionId(sessionId);

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new Error(`Container for session ${sessionId} is not running`);
      }

      // Resolve full path as /workspace/{path}
      const fullPath = `/workspace/${filePath}`;

      // Read file using cat command via exec
      const result = await this.execInContainerBySessionId(
        sessionId,
        ['cat', fullPath],
        '/workspace',
        undefined,
        30000, // 30 second timeout for file read
      );

      // Check if cat command succeeded
      if (result.exitCode !== 0) {
        throw new Error(`File not found or cannot be read: ${filePath}`);
      }

      return result.stdout;
    } catch (error) {
      // Re-throw BadRequestException as-is (HTTP 400)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Wrap other errors (file-not-found, Docker failures) as HTTP 500
      throw new Error(
        `Failed to read file from container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * Write a file to container filesystem by session ID
   * Task 7.2B: Container File Write (Create / Overwrite)
   *
   * @param sessionId - Session identifier
   * @param filePath - Relative path from /workspace (e.g., "index.js", "src/app.ts")
   * @param content - File content as UTF-8 string
   * @throws BadRequestException if path is invalid
   * @throws Error if container not found, not running, or file write fails
   */
  async writeFileToContainer(
    sessionId: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    try {
      // Validate path safety (throws BadRequestException on invalid path)
      this.validateWorkspacePath(filePath);

      // Find container by session ID
      const container = await this.findContainerBySessionId(sessionId);

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new Error(`Container for session ${sessionId} is not running`);
      }

      // Resolve full path as /workspace/{path}
      const fullPath = `/workspace/${filePath}`;

      // Create parent directories and write file using printf (safe for any content)
      // Pass FILE and CONTENT as env vars to avoid shell escaping issues
      const result = await this.execInContainerBySessionId(
        sessionId,
        ['sh', '-c', 'mkdir -p "$(dirname "$FILE")" && printf "%s" "$CONTENT" > "$FILE"'],
        '/workspace',
        {
          FILE: fullPath,
          CONTENT: content,
        },
        30000, // 30 second timeout for file write
      );

      // Check if write command succeeded
      if (result.exitCode !== 0) {
        throw new Error(`Failed to write file: ${filePath}`);
      }
    } catch (error) {
      // Re-throw BadRequestException as-is (HTTP 400)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Wrap other errors (container errors, write failures) as HTTP 500
      throw new Error(
        `Failed to write file to container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * List directory contents from container filesystem by session ID
   * Task 7.2C: Container Directory Listing (Read-Only)
   *
   * @param sessionId - Session identifier
   * @param dirPath - Relative path from /workspace (empty or "/" means root)
   * @returns Array of directory entries with name, type, size, modifiedAt
   * @throws BadRequestException if path is invalid
   * @throws Error if container not found, not running, or listing fails
   */
  async listDirectoryInContainer(
    sessionId: string,
    dirPath: string = '/',
  ): Promise<
    Array<{ name: string; type: 'file' | 'dir'; size: number; modifiedAt: string }>
  > {
    try {
      // Normalize path: empty or "/" means root workspace
      const normalizedPath = !dirPath || dirPath === '/' ? '' : dirPath;

      // Validate if not root
      if (normalizedPath) {
        this.validateWorkspacePath(normalizedPath);
      }

      // Find container by session ID
      const container = await this.findContainerBySessionId(sessionId);

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new Error(`Container for session ${sessionId} is not running`);
      }

      // Resolve full path
      const fullPath = normalizedPath ? `/workspace/${normalizedPath}` : '/workspace';

      // Shell script to list directory with structured output
      // Uses pipe-separated format: name|type|size|mtime
      const listScript = `
        cd "$DIR" || exit 1
        for f in * .[^.]* ..?*; do
          [ -e "$f" ] || continue
          [ "$f" = "." ] && continue
          [ "$f" = ".." ] && continue
          if [ -d "$f" ]; then
            type="dir"
          elif [ -f "$f" ]; then
            type="file"
          else
            continue
          fi
          size=$(stat -c %s "$f" 2>/dev/null || echo "0")
          mtime=$(stat -c %Y "$f" 2>/dev/null || echo "0")
          echo "$f|$type|$size|$mtime"
        done
      `.trim();

      // Execute listing via container exec
      const result = await this.execInContainerBySessionId(
        sessionId,
        ['sh', '-c', listScript],
        '/workspace',
        { DIR: fullPath },
        30000, // 30 second timeout
      );

      // Check if listing succeeded
      if (result.exitCode !== 0) {
        throw new Error(`Directory not found or cannot be read: ${dirPath}`);
      }

      // Parse output into structured entries
      const entries = result.stdout
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
          const [name, type, sizeStr, mtimeStr] = line.split('|');
          const size = parseInt(sizeStr, 10) || 0;
          const mtimeUnix = parseInt(mtimeStr, 10) || 0;
          const modifiedAt = new Date(mtimeUnix * 1000).toISOString();

          return {
            name,
            type: type as 'file' | 'dir',
            size,
            modifiedAt,
          };
        });

      return entries;
    } catch (error) {
      // Re-throw BadRequestException as-is (HTTP 400)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Wrap other errors (directory-not-found, Docker failures) as HTTP 500
      throw new Error(
        `Failed to list directory in container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * Get file/directory metadata from container filesystem by session ID
   * Task 7.2D: Container File Stat / Existence
   *
   * @param sessionId - Session identifier
   * @param filePath - Relative path from /workspace
   * @returns Object with path, exists, and metadata if exists
   * @throws BadRequestException if path is invalid
   * @throws Error if container not found, not running, or stat fails
   */
  async statPathInContainer(
    sessionId: string,
    filePath: string,
  ): Promise<{
    path: string;
    exists: boolean;
    type?: 'file' | 'dir';
    size?: number;
    modifiedAt?: string;
  }> {
    try {
      // Validate path safety (throws BadRequestException on invalid path)
      this.validateWorkspacePath(filePath);

      // Find container by session ID
      const container = await this.findContainerBySessionId(sessionId);

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new Error(`Container for session ${sessionId} is not running`);
      }

      // Resolve full path as /workspace/{path}
      const fullPath = `/workspace/${filePath}`;

      // Shell script to check existence and get metadata
      // Exit code 0 if exists, 1 if not exists
      const statScript = `
        if [ ! -e "$PATH" ]; then
          echo "exists=false"
          exit 0
        fi
        if [ -d "$PATH" ]; then
          type="dir"
        elif [ -f "$PATH" ]; then
          type="file"
        else
          type="other"
        fi
        size=$(stat -c %s "$PATH" 2>/dev/null || echo "0")
        mtime=$(stat -c %Y "$PATH" 2>/dev/null || echo "0")
        echo "exists=true|type=$type|size=$size|mtime=$mtime"
      `.trim();

      // Execute stat via container exec
      const result = await this.execInContainerBySessionId(
        sessionId,
        ['sh', '-c', statScript],
        '/workspace',
        { PATH: fullPath },
        30000, // 30 second timeout
      );

      // Parse output
      const output = result.stdout.trim();

      // Check if path doesn't exist
      if (output === 'exists=false') {
        return {
          path: filePath,
          exists: false,
        };
      }

      // Parse metadata from pipe-separated output
      const parts = output.replace('exists=true|', '').split('|');
      const metadata: Record<string, string> = {};
      parts.forEach((part) => {
        const [key, value] = part.split('=');
        metadata[key] = value;
      });

      const type = metadata.type === 'dir' ? 'dir' : 'file';
      const size = parseInt(metadata.size, 10) || 0;
      const mtimeUnix = parseInt(metadata.mtime, 10) || 0;
      const modifiedAt = new Date(mtimeUnix * 1000).toISOString();

      return {
        path: filePath,
        exists: true,
        type,
        size,
        modifiedAt,
      };
    } catch (error) {
      // Re-throw BadRequestException as-is (HTTP 400)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Wrap other errors (container errors, stat failures) as HTTP 500
      throw new Error(
        `Failed to stat path in container for session ${sessionId}: ${error.message}`,
      );
    }
  }

  /**
   * Validate that a path is safe for workspace operations
   * Rejects path traversal attempts and absolute paths outside /workspace
   * Task 7.2A-1: Throws BadRequestException for invalid paths (HTTP 400)
   *
   * @param filePath - Relative path to validate
   * @throws BadRequestException if path is unsafe
   */
  private validateWorkspacePath(filePath: string): void {
    // Reject empty paths
    if (!filePath || filePath.trim() === '') {
      throw new BadRequestException('File path is required');
    }

    // Reject path traversal attempts
    if (filePath.includes('..')) {
      throw new BadRequestException('Path traversal not allowed');
    }

    // Reject absolute paths that don't start with /workspace
    if (filePath.startsWith('/') && !filePath.startsWith('/workspace')) {
      throw new BadRequestException('Absolute paths outside /workspace not allowed');
    }

    // Reject paths that try to escape workspace via absolute path
    if (filePath.startsWith('/workspace')) {
      throw new BadRequestException('Path must be relative to /workspace');
    }
  }
}
