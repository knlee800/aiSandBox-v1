import { IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
