import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from './session.entity';

/**
 * GitCheckpoint Entity
 * Represents a git checkpoint/commit created during a sandbox session
 * Used for version control, timeline navigation, and rollback functionality
 */
@Entity('git_checkpoints')
export class GitCheckpoint {
  /**
   * Unique identifier (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Parent session (many-to-one relationship)
   * Cascade delete when session is deleted
   */
  @ManyToOne(() => Session, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  /**
   * Session ID (foreign key)
   * Indexed for fast lookups by session
   */
  @Index('idx_git_checkpoint_session_id')
  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

  /**
   * Git commit hash (SHA)
   * Indexed for fast lookups and verification
   */
  @Index('idx_git_checkpoint_commit_hash')
  @Column({ type: 'varchar', length: 40, name: 'commit_hash' })
  commitHash: string;

  /**
   * Associated message number in conversation
   * Links checkpoint to the chat message that triggered it
   * Nullable for manual checkpoints or initial commits
   */
  @Column({ type: 'integer', nullable: true, name: 'message_number' })
  messageNumber: number | null;

  /**
   * Human-readable checkpoint description
   * Summary of changes or action performed
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /**
   * Number of files changed in this checkpoint
   * Used for UI display and change magnitude tracking
   */
  @Column({ type: 'integer', name: 'files_changed', default: 0 })
  filesChanged: number;

  /**
   * Checkpoint creation timestamp
   * Used for timeline ordering and chronological navigation
   */
  @CreateDateColumn({ name: 'created_at' })
  @Index('idx_git_checkpoint_created_at')
  createdAt: Date;
}
