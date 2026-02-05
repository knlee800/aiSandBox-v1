/**
 * Chat Message Role Enumeration
 * Defines the role/sender of a message in a conversation
 */
export enum ChatMessageRole {
  /**
   * Message from the end user
   */
  USER = 'user',

  /**
   * Message from the AI assistant
   */
  ASSISTANT = 'assistant',

  /**
   * System-generated message (instructions, notifications, etc.)
   */
  SYSTEM = 'system',
}
