import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from './session.entity';
import { ContainerStatus } from './container-status.enum';

/**
 * Container Entity
 * Represents the Docker container metadata for a sandbox session
 * One-to-one relationship with Session
 * Tracks lifecycle, resource limits, and state
 */
@Entity('containers')
export class Container {
  /**
   * Unique identifier (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Associated session (one-to-one relationship)
   * Cascade delete when session is deleted
   */
  @OneToOne(() => Session, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  /**
   * Session ID (foreign key, unique)
   * Indexed for fast lookups by session
   */
  @Index('idx_container_session_id', { unique: true })
  @Column({ type: 'uuid', name: 'session_id', unique: true })
  sessionId: string;

  /**
   * Docker container name
   * Must be unique across all containers
   */
  @Index('idx_container_name', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, name: 'container_name' })
  containerName: string;

  /**
   * Docker image name used for this container
   * Example: 'node:18-alpine', 'python:3.11-slim'
   */
  @Column({ type: 'varchar', length: 255 })
  image: string;

  /**
   * Current container lifecycle status
   */
  @Index('idx_container_status')
  @Column({
    type: 'enum',
    enum: ContainerStatus,
    default: ContainerStatus.CREATING,
  })
  status: ContainerStatus;

  /**
   * CPU limit (cores)
   * Nullable to allow unlimited or default settings
   */
  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true, name: 'cpu_limit' })
  cpuLimit: number | null;

  /**
   * Memory limit in megabytes
   * Nullable to allow unlimited or default settings
   */
  @Column({ type: 'integer', nullable: true, name: 'memory_limit_mb' })
  memoryLimitMb: number | null;

  /**
   * Container creation timestamp
   * When the container metadata record was created
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Container start timestamp
   * When the container actually started running
   * Nullable if container hasn't started yet
   */
  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  startedAt: Date | null;

  /**
   * Container stop timestamp
   * When the container was stopped or terminated
   * Nullable if container is still running
   */
  @Column({ type: 'timestamp', nullable: true, name: 'stopped_at' })
  stoppedAt: Date | null;
}
