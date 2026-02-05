import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class FilesService {
  constructor(
    private sessionsService: SessionsService,
    private httpService: HttpService,
  ) {}

  async readFile(sessionId: string, filePath: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const fullPath = this.resolvePath(workspacePath, filePath);

    this.validatePath(workspacePath, fullPath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);

      return {
        path: filePath,
        content,
        size: stats.size,
        modified: stats.mtime,
      };
    } catch (error) {
      throw new NotFoundException(`File not found: ${filePath}`);
    }
  }

  async writeFile(sessionId: string, filePath: string, content: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const fullPath = this.resolvePath(workspacePath, filePath);

    this.validatePath(workspacePath, fullPath);

    // Check if file exists to determine action
    const exists = fsSync.existsSync(fullPath);
    const action = exists ? 'updated' : 'created';

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');

    // Update session activity
    await this.sessionsService.updateActivity(sessionId);

    // Emit file change event
    await this.emitFileChange(sessionId, filePath, action);

    return {
      path: filePath,
      size: Buffer.byteLength(content, 'utf-8'),
      message: 'File written successfully',
    };
  }

  async deleteFile(sessionId: string, filePath: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const fullPath = this.resolvePath(workspacePath, filePath);

    this.validatePath(workspacePath, fullPath);

    try {
      await fs.unlink(fullPath);

      // Emit file change event
      await this.emitFileChange(sessionId, filePath, 'deleted');

      return { message: 'File deleted successfully' };
    } catch (error) {
      throw new NotFoundException(`File not found: ${filePath}`);
    }
  }

  async listFiles(sessionId: string, dirPath: string = '/') {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const fullPath = this.resolvePath(workspacePath, dirPath);

    this.validatePath(workspacePath, fullPath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      const files = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(fullPath, entry.name);
          const stats = await fs.stat(entryPath);
          const relativePath = path.relative(workspacePath, entryPath);

          return {
            name: entry.name,
            path: relativePath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime,
          };
        })
      );

      return files;
    } catch (error) {
      throw new NotFoundException(`Directory not found: ${dirPath}`);
    }
  }

  async createDirectory(sessionId: string, dirPath: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const fullPath = this.resolvePath(workspacePath, dirPath);

    this.validatePath(workspacePath, fullPath);

    await fs.mkdir(fullPath, { recursive: true });

    return {
      path: dirPath,
      message: 'Directory created successfully',
    };
  }

  private resolvePath(workspacePath: string, relativePath: string): string {
    // Remove leading slash if present
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return path.join(workspacePath, cleanPath);
  }

  private validatePath(workspacePath: string, fullPath: string) {
    // Ensure the path is within the workspace (prevent directory traversal)
    const resolvedPath = path.resolve(fullPath);
    const resolvedWorkspace = path.resolve(workspacePath);

    if (!resolvedPath.startsWith(resolvedWorkspace)) {
      throw new BadRequestException('Invalid path: outside workspace');
    }
  }

  private async emitFileChange(sessionId: string, filePath: string, action: 'created' | 'updated' | 'deleted') {
    try {
      await firstValueFrom(
        this.httpService.post('http://localhost:4000/api/events/file-changed', {
          sessionId,
          file: {
            path: filePath,
            action,
            timestamp: new Date().toISOString(),
          },
        }),
      );
    } catch (error) {
      console.error('Failed to emit file change event:', error.message);
    }
  }
}
