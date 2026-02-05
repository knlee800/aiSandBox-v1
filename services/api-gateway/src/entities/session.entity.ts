import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SessionStatus } from './session-status.enum';
import { User } from './user.entity';

/**
 * Session Entity
 * Represents a sandbox session with an isolated container
 */
@Entity('sessions')
export class Session {
  /**
   * Unique identifier (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Session status (pending, active, stopped, expired, error)
   */
  @Index('idx_session_status')
  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.PENDING,
  })
  status: SessionStatus;

  /**
   * Docker container ID (nullable until container is created)
   */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'container_id' })
  containerId: string | null;

  /**
   * Session creation timestamp
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Session expiration timestamp
   * After this time, the session should be marked as expired
   */
  @Index('idx_session_expires_at')
  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;

  /**
   * Last activity timestamp
   * Updated on each user interaction
   */
  @Column({ type: 'timestamp', name: 'last_activity_at' })
  lastActivityAt: Date;

  /**
   * Owning user (many-to-one relationship)
   */
  @ManyToOne(() => User, (user) => user.sessions, {
    nullable: false,
    onDelete: 'CASCADE', // Delete sessions when user is deleted
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * User ID (foreign key)
   * Indexed for fast lookups by user
   */
  @Index('idx_session_user_id')
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;
}
