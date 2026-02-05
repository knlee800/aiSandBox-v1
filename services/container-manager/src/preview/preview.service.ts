import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface PreviewProcess {
  process: ChildProcess;
  port: number;
  status: 'starting' | 'running' | 'error';
  command: string;
  framework?: string;
  startedAt: Date;
}

@Injectable()
export class PreviewService {
  private activePreviews: Map<string, PreviewProcess> = new Map();
  private portPool: Set<number> = new Set();
  private readonly PORT_RANGE_START = 3001;
  private readonly PORT_RANGE_END = 3100;

  constructor(private sessionsService: SessionsService) {
    // Initialize port pool
    for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
      this.portPool.add(port);
    }
  }

  /**
   * Start a preview server for a session
   */
  async startPreview(sessionId: string, command?: string): Promise<{ port: number; status: string; framework?: string }> {
    // Check if preview already running
    if (this.activePreviews.has(sessionId)) {
      const existing = this.activePreviews.get(sessionId)!;
      return {
        port: existing.port,
        status: existing.status,
        framework: existing.framework,
      };
    }

    // Get workspace path
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);

    // Auto-detect framework and command if not provided
    const { detectedCommand, framework } = await this.detectFramework(workspacePath, command);

    if (!detectedCommand) {
      throw new BadRequestException('No package.json or start command found. Cannot start preview.');
    }

    // Allocate a port
    const port = this.allocatePort();
    if (!port) {
      throw new BadRequestException('No available ports for preview. Maximum concurrent previews reached.');
    }

    console.log(`Starting preview for session ${sessionId} on port ${port} with command: ${detectedCommand}`);

    // Replace PORT placeholder with actual port number
    const finalCommand = detectedCommand.replace(/\$PORT/g, port.toString());

    console.log(`Final command: ${finalCommand}`);

    // Start the process
    const childProcess = spawn('sh', ['-c', finalCommand], {
      cwd: workspacePath,
      env: {
        ...process.env,
        PORT: port.toString(),
        NODE_ENV: 'development',
      },
      detached: true,  // Create a new process group
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Unref so the parent process can exit independently
    childProcess.unref();

    // Store preview info
    this.activePreviews.set(sessionId, {
      process: childProcess,
      port,
      status: 'starting',
      command: detectedCommand,
      framework,
      startedAt: new Date(),
    });

    // Handle process output
    childProcess.stdout?.on('data', (data) => {
      console.log(`[Preview ${sessionId}] ${data.toString().trim()}`);

      // Detect when server is ready
      const output = data.toString().toLowerCase();
      if (
        output.includes('compiled successfully') ||
        output.includes('ready on') ||
        output.includes('local:') ||
        output.includes('listening on') ||
        output.includes('started server') ||
        output.includes('accepting connections')
      ) {
        const preview = this.activePreviews.get(sessionId);
        if (preview) {
          preview.status = 'running';
          console.log(`[Preview ${sessionId}] Server is now running on port ${port}`);
        }
      }
    });

    childProcess.stderr?.on('data', (data) => {
      console.error(`[Preview ${sessionId}] Error: ${data.toString().trim()}`);
    });

    childProcess.on('error', (error) => {
      console.error(`[Preview ${sessionId}] Process error:`, error);
      const preview = this.activePreviews.get(sessionId);
      if (preview) {
        preview.status = 'error';
      }
    });

    childProcess.on('exit', (code) => {
      console.log(`[Preview ${sessionId}] Process exited with code ${code}`);
      this.releasePort(port);
      this.activePreviews.delete(sessionId);
    });

    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    const preview = this.activePreviews.get(sessionId);
    return {
      port,
      status: preview?.status || 'starting',
      framework: preview?.framework,
    };
  }

  /**
   * Stop a preview server
   */
  async stopPreview(sessionId: string): Promise<{ message: string }> {
    const preview = this.activePreviews.get(sessionId);

    if (!preview) {
      throw new NotFoundException('No active preview for this session');
    }

    try {
      preview.process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force kill if still running
      if (!preview.process.killed) {
        preview.process.kill('SIGKILL');
      }

      this.releasePort(preview.port);
      this.activePreviews.delete(sessionId);

      return { message: 'Preview stopped successfully' };
    } catch (error) {
      console.error(`Error stopping preview for session ${sessionId}:`, error);
      throw new BadRequestException('Failed to stop preview');
    }
  }

  /**
   * Get preview status
   */
  getPreviewStatus(sessionId: string): { port: number; status: string; framework?: string; uptime?: number } | null {
    const preview = this.activePreviews.get(sessionId);

    if (!preview) {
      return null;
    }

    const uptime = Math.floor((Date.now() - preview.startedAt.getTime()) / 1000);

    return {
      port: preview.port,
      status: preview.status,
      framework: preview.framework,
      uptime,
    };
  }

  /**
   * Auto-detect framework and command from workspace
   */
  private async detectFramework(workspacePath: string, providedCommand?: string): Promise<{ detectedCommand: string | null; framework?: string }> {
    // If command provided, use it
    if (providedCommand) {
      return { detectedCommand: providedCommand };
    }

    // Check for package.json
    const packageJsonPath = path.join(workspacePath, 'package.json');

    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      // Detect framework
      let framework: string | undefined;
      let command: string | null = null;

      // Check dependencies for framework detection
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps['next']) {
        framework = 'Next.js';
        command = 'npm run dev';
      } else if (deps['react-scripts']) {
        framework = 'Create React App';
        command = 'npm start';
      } else if (deps['vite']) {
        framework = 'Vite';
        command = 'npm run dev';
      } else if (deps['@vue/cli-service']) {
        framework = 'Vue CLI';
        command = 'npm run serve';
      } else if (deps['vue']) {
        framework = 'Vue';
        command = 'npm run dev';
      } else if (deps['express']) {
        framework = 'Express';
        command = 'node server.js';
      }

      // Override with package.json scripts if available
      if (packageJson.scripts) {
        if (packageJson.scripts.dev) {
          command = 'npm run dev';
        } else if (packageJson.scripts.start) {
          command = 'npm start';
        } else if (packageJson.scripts.serve) {
          command = 'npm run serve';
        }
      }

      return { detectedCommand: command, framework };
    } catch (error) {
      // No package.json found - check for static HTML
      try {
        const files = await fs.readdir(workspacePath);
        if (files.some(f => f.endsWith('.html'))) {
          return {
            detectedCommand: 'npx serve -s . --listen $PORT',
            framework: 'Static HTML',
          };
        }
      } catch {
        // Ignore
      }

      return { detectedCommand: null };
    }
  }

  /**
   * Allocate a port from the pool
   */
  private allocatePort(): number | null {
    const availablePorts = Array.from(this.portPool);
    if (availablePorts.length === 0) {
      return null;
    }

    const port = availablePorts[0];
    this.portPool.delete(port);
    return port;
  }

  /**
   * Release a port back to the pool
   */
  private releasePort(port: number): void {
    this.portPool.add(port);
  }

  /**
   * Cleanup all previews (called on service shutdown)
   */
  async onModuleDestroy() {
    console.log('Cleaning up all preview processes...');
    for (const [sessionId, preview] of this.activePreviews.entries()) {
      try {
        preview.process.kill('SIGTERM');
        this.releasePort(preview.port);
      } catch (error) {
        console.error(`Error killing preview process for session ${sessionId}:`, error);
      }
    }
    this.activePreviews.clear();
  }
}
