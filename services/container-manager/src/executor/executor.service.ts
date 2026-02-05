import { Injectable, BadRequestException } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SessionsService } from '../sessions/sessions.service';

const execPromise = promisify(exec);

/**
 * ExecutorService
 * Task 7.1C: Executor Routing Switch
 *
 * Routes command execution based on session context:
 * - Session-scoped commands → Execute inside container via SessionsService
 * - Non-session commands → Execute on host via child_process (preserved for future use)
 */
@Injectable()
export class ExecutorService {
  private allowedCommands = ['npm', 'node', 'ls', 'cat', 'echo', 'pwd'];

  constructor(private sessionsService: SessionsService) {}

  /**
   * Execute a command for a session
   * Task 7.1C: Now routes to container execution
   *
   * @param sessionId - Session identifier (routes to container)
   * @param command - Command string (e.g., "node -v")
   * @param timeout - Execution timeout in milliseconds (default: 30000)
   * @returns Execution result with stdout, stderr, exitCode
   */
  async execute(sessionId: string, command: string, timeout: number = 30000) {
    // Validate sessionId is provided
    if (!sessionId || sessionId.trim() === '') {
      throw new BadRequestException('sessionId required');
    }

    // Validate command
    const cmd = command.trim().split(' ')[0];
    if (!this.allowedCommands.includes(cmd)) {
      throw new BadRequestException(`Command not allowed: ${cmd}`);
    }

    // Route to container execution
    return this.executeInContainer(sessionId, command, timeout);
  }

  /**
   * Execute command inside container
   * Task 7.1C: Executor Routing Switch
   * Patch: Shell semantics and error handling
   *
   * @param sessionId - Session identifier
   * @param command - Command string
   * @param timeout - Timeout in milliseconds
   */
  private async executeInContainer(
    sessionId: string,
    command: string,
    timeout: number,
  ) {
    try {
      // Detect if command requires shell parsing
      const cmdArray = this.needsShell(command)
        ? ['sh', '-lc', command]
        : this.parseCommand(command);

      // Execute via container-manager internal exec capability
      const result = await this.sessionsService.execInContainer(
        sessionId,
        cmdArray,
        '/workspace', // Default working directory
        undefined, // No custom env vars
        timeout,
      );

      // Map to expected response shape, preserving actual exit code
      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (error) {
      // Exception occurred (container not running, timeout, etc.)
      // No exec result available
      return {
        success: false,
        stdout: '',
        stderr: error.message || 'Execution failed',
        exitCode: 1,
      };
    }
  }

  /**
   * Execute command on host (legacy behavior)
   * Preserved for non-session command execution
   *
   * @param sessionId - Session identifier (used for workspace path)
   * @param command - Command string
   * @param timeout - Timeout in milliseconds
   */
  private async executeOnHost(
    sessionId: string,
    command: string,
    timeout: number,
  ) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);

    try {
      const { stdout, stderr } = await execPromise(command, {
        cwd: workspacePath,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
      });

      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
      };
    }
  }

  /**
   * Parse command string into array for exec API
   * Simple whitespace-based splitting (no shell parsing)
   *
   * @param command - Command string (e.g., "node -v")
   * @returns Array of command parts (e.g., ["node", "-v"])
   */
  private parseCommand(command: string): string[] {
    return command.trim().split(/\s+/);
  }

  /**
   * Check if command requires shell execution
   * Detects shell metacharacters that require sh -lc wrapper
   *
   * @param command - Command string
   * @returns true if shell execution needed
   */
  private needsShell(command: string): boolean {
    // Shell metacharacters that require shell parsing
    const shellMetachars = /[|&;<>()$`\\"\'\*\?\[\]#~]/;
    return shellMetachars.test(command);
  }

  getAllowedCommands() {
    return this.allowedCommands;
  }
}
