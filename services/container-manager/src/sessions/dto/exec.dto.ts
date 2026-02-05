import { IsArray, IsString, IsOptional, IsNumber, IsObject, Min, ArrayNotEmpty } from 'class-validator';

/**
 * ExecCommandDto
 * Task 7.1A: Internal Container Exec Primitive
 *
 * Request body for POST /api/internal/sessions/:id/exec
 */
export class ExecCommandDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  cmd: string[];

  @IsOptional()
  @IsString()
  cwd?: string = '/workspace';

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeoutMs?: number = 300000; // 5 minutes default
}

/**
 * ExecResultDto
 * Response body for POST /api/internal/sessions/:id/exec
 */
export class ExecResultDto {
  exitCode: number;
  stdout: string;
  stderr: string;
}
