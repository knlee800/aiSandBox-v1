import { IsString, IsNotEmpty } from 'class-validator';

export class WriteFileDto {
  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  content: string;
}

export class ReadFileDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}

export class DeleteFileDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}

export class CreateDirectoryDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}
