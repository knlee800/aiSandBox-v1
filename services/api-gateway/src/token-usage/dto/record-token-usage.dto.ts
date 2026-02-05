import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * DTO for recording token usage
 * Used by ai-service to persist token consumption data
 */
export class RecordTokenUsageDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsOptional()
  chatMessageId?: string | null;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsNumber()
  @Min(0)
  inputTokens: number;

  @IsNumber()
  @Min(0)
  outputTokens: number;
}
