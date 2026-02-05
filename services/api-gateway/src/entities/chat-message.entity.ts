import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { ChatMessageRole } from './chat-message-role.enum';

/**
 * ChatMessage Entity
 * Represents an individual message within a conversation
 * Many-to-one relationship with Conversation
 */
@Entity('chat_messages')
export class ChatMessage {
  /**
   * Unique identifier (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Parent conversation (many-to-one relationship)
   * Cascade delete when conversation is deleted
   */
  @ManyToOne(() => Conversation, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  /**
   * Conversation ID (foreign key)
   * Indexed for fast lookups by conversation
   */
  @Index('idx_chat_message_conversation_id')
  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId: string;

  /**
   * Message role (user, assistant, system)
   * Indicates who sent the message
   */
  @Column({
    type: 'enum',
    enum: ChatMessageRole,
  })
  role: ChatMessageRole;

  /**
   * Message content (text)
   * The actual message body
   */
  @Column({ type: 'text' })
  content: string;

  /**
   * Number of tokens used for this message
   * Used for billing and usage tracking
   */
  @Column({ type: 'integer', name: 'tokens_used', default: 0 })
  tokensUsed: number;

  /**
   * Message creation timestamp
   * Used for ordering messages chronologically
   */
  @CreateDateColumn({ name: 'created_at' })
  @Index('idx_chat_message_created_at')
  createdAt: Date;
}
