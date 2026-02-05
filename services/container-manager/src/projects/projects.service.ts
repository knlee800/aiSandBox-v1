import { Injectable, NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectMetadata {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  lastModified: string;
  workspaceSnapshotPath: string;
}

@Injectable()
export class ProjectsService {
  private db: Database.Database;
  private projectsRoot: string;

  constructor() {
    // Connect to database
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);

    // Set projects directory
    this.projectsRoot = path.join(__dirname, '../../../..', 'projects');

    // Create projects directory if it doesn't exist
    if (!fsSync.existsSync(this.projectsRoot)) {
      fsSync.mkdirSync(this.projectsRoot, { recursive: true });
    }
  }

  /**
   * Create a new project
   * Persists project metadata to database and filesystem
   * Creates project directory structure
   *
   * @param userId - User ID who owns the project
   * @param name - Optional project name (auto-generated if not provided)
   * @param description - Optional project description
   * @returns Project metadata
   */
  async createProject(
    userId: string,
    name?: string,
    description?: string,
  ): Promise<ProjectMetadata> {
    // Generate project ID
    const projectId = this.generateId();

    // Generate name if not provided
    const projectName = name || `Project ${projectId.substring(0, 8)}`;

    // Generate slug from name
    const slug = this.generateSlug(projectName, projectId);

    // Create project directory
    const projectDir = path.join(this.projectsRoot, projectId);
    await fs.mkdir(projectDir, { recursive: true });

    // Prepare project metadata
    const now = new Date().toISOString();
    const metadata: ProjectMetadata = {
      id: projectId,
      userId,
      name: projectName,
      description: description || undefined,
      createdAt: now,
      lastModified: now,
      workspaceSnapshotPath: path.join(projectDir, 'workspace.tar'),
    };

    // Insert into database
    this.db
      .prepare(`
        INSERT INTO projects (
          id, user_id, name, slug, description,
          storage_path, created_at, last_modified
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .run(
        projectId,
        userId,
        projectName,
        slug,
        description || null,
        projectDir,
      );

    // Write project.json to filesystem
    const projectJsonPath = path.join(projectDir, 'project.json');
    await fs.writeFile(
      projectJsonPath,
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );

    // Create empty workspace.tar (initial state)
    await this.createEmptyWorkspaceArchive(projectDir);

    return metadata;
  }

  /**
   * Find project by ID
   * Reads from database and filesystem
   *
   * @param projectId - Project ID
   * @returns Project metadata
   * @throws NotFoundException if project does not exist
   */
  async findById(projectId: string): Promise<ProjectMetadata> {
    // Query database
    const project = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(projectId) as any;

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Read project.json from filesystem
    const projectDir = path.join(this.projectsRoot, projectId);
    const projectJsonPath = path.join(projectDir, 'project.json');

    try {
      const content = await fs.readFile(projectJsonPath, 'utf-8');
      return JSON.parse(content) as ProjectMetadata;
    } catch (error) {
      // Fallback: construct from database if filesystem read fails
      return {
        id: project.id,
        userId: project.user_id,
        name: project.name,
        description: project.description || undefined,
        createdAt: project.created_at,
        lastModified: project.last_modified,
        workspaceSnapshotPath: path.join(projectDir, 'workspace.tar'),
      };
    }
  }

  /**
   * Validate that a project exists
   *
   * @param projectId - Project ID
   * @returns true if project exists, false otherwise
   */
  async exists(projectId: string): Promise<boolean> {
    const project = this.db
      .prepare('SELECT id FROM projects WHERE id = ?')
      .get(projectId);

    return !!project;
  }

  /**
   * Persist workspace snapshot for a project
   * Archives workspace directory to workspace.tar
   *
   * @param projectId - Project ID
   * @param workspacePath - Path to workspace directory to archive
   */
  async persistWorkspaceSnapshot(
    projectId: string,
    workspacePath: string,
  ): Promise<void> {
    const project = await this.findById(projectId);
    const projectDir = path.join(this.projectsRoot, projectId);
    const workspaceTarPath = path.join(projectDir, 'workspace.tar');

    // Archive workspace directory using tar
    // Note: This is PERSISTENCE only, no extraction/restore logic yet
    try {
      await execAsync(
        `tar -cf "${workspaceTarPath}" -C "${workspacePath}" .`,
      );

      // Update last_modified timestamp in database
      this.db
        .prepare("UPDATE projects SET last_modified = datetime('now') WHERE id = ?")
        .run(projectId);

      // Update project.json
      const metadata = await this.findById(projectId);
      metadata.lastModified = new Date().toISOString();
      const projectJsonPath = path.join(projectDir, 'project.json');
      await fs.writeFile(
        projectJsonPath,
        JSON.stringify(metadata, null, 2),
        'utf-8',
      );
    } catch (error) {
      console.error(
        `Failed to persist workspace snapshot for project ${projectId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get project directory path
   *
   * @param projectId - Project ID
   * @returns Absolute path to project directory
   */
  getProjectDirectory(projectId: string): string {
    return path.join(this.projectsRoot, projectId);
  }

  /**
   * Create an empty workspace archive
   * Used for initial project creation
   *
   * @param projectDir - Project directory path
   */
  private async createEmptyWorkspaceArchive(projectDir: string): Promise<void> {
    const workspaceTarPath = path.join(projectDir, 'workspace.tar');

    // Create an empty tar archive
    // Create a temporary empty directory and archive it
    const tempDir = path.join(projectDir, '.temp-empty');
    await fs.mkdir(tempDir, { recursive: true });

    try {
      await execAsync(`tar -cf "${workspaceTarPath}" -C "${tempDir}" .`);
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Generate a URL-safe slug from project name
   *
   * @param name - Project name
   * @param projectId - Project ID (used for uniqueness)
   * @returns URL-safe slug
   */
  private generateSlug(name: string, projectId: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Append first 8 chars of project ID for uniqueness
    return `${baseSlug}-${projectId.substring(0, 8)}`;
  }

  /**
   * Generate a unique ID
   * Simple timestamp + random string generator
   *
   * @returns Unique ID string
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
