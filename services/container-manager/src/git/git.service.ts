import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { simpleGit, SimpleGit } from 'simple-git';
import { SessionsService } from '../sessions/sessions.service';
import { ApiGatewayHttpClient } from '../clients/api-gateway-http.client';
import Database from 'better-sqlite3';
import * as path from 'path';

@Injectable()
export class GitService {
  private db: Database.Database;

  constructor(
    private sessionsService: SessionsService,
    private httpService: HttpService,
    private apiGatewayClient: ApiGatewayHttpClient,
  ) {
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  async initializeGit(sessionId: string, userId: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const git: SimpleGit = simpleGit(workspacePath);

    // Initialize git
    await git.init();
    await git.addConfig('user.name', 'AI Sandbox');
    await git.addConfig('user.email', 'sandbox@aisandbox.com');

    // Create initial commit
    await git.add('./*');
    await git.commit('Initial commit');

    // Update database
    this.db
      .prepare('UPDATE sessions SET git_initialized = 1 WHERE id = ?')
      .run(sessionId);

    // Create checkpoint
    const commitHash = await git.revparse(['HEAD']);
    await this.createCheckpoint(sessionId, userId, 0, commitHash, 'Initial commit');

    return {
      message: 'Git initialized successfully',
      commitHash,
    };
  }

  async commit(sessionId: string, userId: string, messageNumber: number, description?: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const git: SimpleGit = simpleGit(workspacePath);

    // Check if there are changes
    const status = await git.status();
    if (status.isClean()) {
      return {
        message: 'No changes to commit',
        commitHash: null,
      };
    }

    // Add all changes
    await git.add('./*');

    // Commit
    const commitMessage = description || `Auto-commit: Message ${messageNumber}`;
    await git.commit(commitMessage);

    // Get commit hash
    const commitHash = await git.revparse(['HEAD']);

    // Create checkpoint
    const filesChanged = status.files.length;
    await this.createCheckpoint(sessionId, userId, messageNumber, commitHash, commitMessage, filesChanged);

    return {
      message: 'Changes committed successfully',
      commitHash,
      filesChanged,
    };
  }

  async getHistory(sessionId: string, limit: number = 10) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const git: SimpleGit = simpleGit(workspacePath);

    try {
      const log = await git.log({ maxCount: limit });
      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        date: commit.date,
        author: commit.author_name,
      }));
    } catch (error) {
      return [];
    }
  }

  async revert(sessionId: string, userId: string, commitHash: string) {
    const workspacePath = this.sessionsService.getWorkspacePath(sessionId);
    const git: SimpleGit = simpleGit(workspacePath);

    // Reset to commit
    await git.reset(['--hard', commitHash]);

    return {
      message: 'Reverted to commit successfully',
      commitHash,
    };
  }

  async getCheckpoints(sessionId: string, limit: number = 10) {
    const checkpoints = this.db
      .prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ? AND is_deleted = 0
        ORDER BY message_number DESC
        LIMIT ?
      `)
      .all(sessionId, limit);

    return checkpoints;
  }

  private async createCheckpoint(
    sessionId: string,
    userId: string,
    messageNumber: number,
    commitHash: string,
    description: string,
    filesChanged: number = 0
  ) {
    // Record checkpoint in api-gateway via HTTP
    try {
      await this.apiGatewayClient.recordGitCheckpoint({
        sessionId,
        commitHash,
        filesChanged,
        messageNumber,
        description,
      });
    } catch (error) {
      console.error('Failed to record checkpoint in api-gateway:', error.message);
      // Continue execution - checkpoint recording failure should not block git operations
    }

    // Keep local database record for backward compatibility
    const id = this.generateId();
    this.db.prepare(`
      INSERT INTO checkpoints (
        id, session_id, user_id, message_number, git_commit_hash,
        checkpoint_type, description, files_changed, created_at, is_deleted
      )
      VALUES (?, ?, ?, ?, ?, 'auto', ?, ?, datetime('now'), 0)
    `).run(id, sessionId, userId, messageNumber, commitHash, description, filesChanged);

    // Emit checkpoint created event
    await this.emitCheckpointCreated(sessionId, {
      id,
      session_id: sessionId,
      user_id: userId,
      message_number: messageNumber,
      git_commit_hash: commitHash,
      checkpoint_type: 'auto',
      description,
      files_changed: filesChanged,
      created_at: new Date().toISOString(),
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private async emitCheckpointCreated(sessionId: string, checkpoint: any) {
    try {
      await firstValueFrom(
        this.httpService.post('http://localhost:4000/api/events/checkpoint-created', {
          sessionId,
          checkpoint,
        }),
      );
    } catch (error) {
      console.error('Failed to emit checkpoint created event:', error.message);
    }
  }
}
