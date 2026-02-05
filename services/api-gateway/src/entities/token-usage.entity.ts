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
 * TokenUsage Entity
 * Immutable ledger for tracking AI token consumption
 * Used for billing calculations, quota enforcement, and usage analytics
 *
 * IMPORTANT: This is an append-only ledger. Records are never updated or deleted.
 * Stores references to conversation/message IDs without relationships to preserve
 * historical data even after those entities are deleted.
 */
@Entity('token_usage')
export class TokenUsage {
  /**
   * Unique identifier (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Parent session (many-to-one relationship)
   * No cascade delete - ledger entries must survive session deletion
   */
  @ManyToOne(() => Session, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  /**
   * Session ID (foreign key)
   * Indexed for aggregating usage by session
   */
  @Index('idx_token_usage_session_id')
  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

  /**
   * Conversation ID (reference only, not a foreign key)
   * Nullable for non-conversation usage
   * Stored as plain UUID to preserve history if conversation is deleted
   */
  @Index('idx_token_usage_conversation_id')
  @Column({ type: 'uuid', nullable: true, name: 'conversation_id' })
  conversationId: string | null;

  /**
   * Chat Message ID (reference only, not a foreign key)
   * Nullable for batch operations or non-message usage
   * Stored as plain UUID to preserve history if message is deleted
   */
  @Index('idx_token_usage_chat_message_id')
  @Column({ type: 'uuid', nullable: true, name: 'chat_message_id' })
  chatMessageId: string | null;

  /**
   * AI model identifier
   * Example: "claude-3.5-sonnet", "claude-3-opus", "gpt-4"
   * Used to determine pricing tier in billing calculations
   */
  @Index('idx_token_usage_model')
  @Column({ type: 'varchar', length: 100 })
  model: string;

  /**
   * Number of input tokens consumed
   * Tokens sent to the AI model (prompt, context, etc.)
   */
  @Column({ type: 'integer', name: 'input_tokens', default: 0 })
  inputTokens: number;

  /**
   * Number of output tokens generated
   * Tokens produced by the AI model (response)
   */
  @Column({ type: 'integer', name: 'output_tokens', default: 0 })
  outputTokens: number;

  /**
   * Total tokens (input + output)
   * Pre-computed and stored for fast aggregation queries
   * Set at write time, never recalculated
   */
  @Column({ type: 'integer', name: 'total_tokens', default: 0 })
  totalTokens: number;

  /**
   * Record creation timestamp
   * Indexed for time-based queries (daily/monthly usage reports)
   * Immutable - represents the exact moment usage occurred
   */
  @CreateDateColumn({ name: 'created_at' })
  @Index('idx_token_usage_created_at')
  createdAt: Date;
}
