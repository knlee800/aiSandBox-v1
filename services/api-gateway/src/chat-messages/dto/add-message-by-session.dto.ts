import { IsString, IsEnum, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ChatMessageRole } from '../../entities/chat-message-role.enum';

/**
 * DTO for adding a message by session ID
 * Used by ai-service to persist chat messages via HTTP
 */
export class AddMessageBySessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsEnum(ChatMessageRole)
  role: ChatMessageRole;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  tokensUsed?: number;
}
