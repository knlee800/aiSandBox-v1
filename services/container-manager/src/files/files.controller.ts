import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { FilesService } from './files.service';
import { WriteFileDto, ReadFileDto, DeleteFileDto, CreateDirectoryDto } from './dto/files.dto';

@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get(':sessionId/list')
  async list(
    @Param('sessionId') sessionId: string,
    @Query('path') dirPath?: string
  ) {
    return this.filesService.listFiles(sessionId, dirPath || '/');
  }

  @Post(':sessionId/read')
  async read(
    @Param('sessionId') sessionId: string,
    @Body() readFileDto: ReadFileDto
  ) {
    return this.filesService.readFile(sessionId, readFileDto.path);
  }

  @Post(':sessionId/write')
  async write(
    @Param('sessionId') sessionId: string,
    @Body() writeFileDto: WriteFileDto
  ) {
    return this.filesService.writeFile(
      sessionId,
      writeFileDto.path,
      writeFileDto.content
    );
  }

  @Delete(':sessionId/delete')
  async delete(
    @Param('sessionId') sessionId: string,
    @Body() deleteFileDto: DeleteFileDto
  ) {
    return this.filesService.deleteFile(sessionId, deleteFileDto.path);
  }

  @Post(':sessionId/mkdir')
  async mkdir(
    @Param('sessionId') sessionId: string,
    @Body() createDirDto: CreateDirectoryDto
  ) {
    return this.filesService.createDirectory(sessionId, createDirDto.path);
  }
}
