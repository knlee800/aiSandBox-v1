import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from './session.entity';

/**
 * Conversation Entity
 * Represents a single chat timeline per sandbox session
 * One-to-one relationship with Session
 */
@Entity('conversations')
export class Conversation {
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
  @Index('idx_conversation_session_id', { unique: true })
  @Column({ type: 'uuid', name: 'session_id', unique: true })
  sessionId: string;

  /**
   * Total number of messages in this conversation
   * Used for tracking conversation length and billing
   */
  @Column({ type: 'integer', name: 'messages_count', default: 0 })
  messagesCount: number;

  /**
   * Conversation creation timestamp
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Last update timestamp
   * Updated whenever conversation properties change
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
