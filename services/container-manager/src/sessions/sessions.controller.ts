import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Post()
  async create(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.createSession(
      createSessionDto.userId,
      createSessionDto.projectId
    );
  }

  @Post(':id/start')
  async start(@Param('id') id: string) {
    await this.sessionsService.startSessionContainer(id);
    return { message: 'Session container started successfully' };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.sessionsService.getSession(id);
  }

  @Get('user/:userId')
  async listUserSessions(@Param('userId') userId: string) {
    return this.sessionsService.listUserSessions(userId);
  }

  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    return this.sessionsService.stopSession(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.sessionsService.deleteSession(id);
  }

  @Get()
  health() {
    return {
      status: 'ok',
      service: 'container-manager',
      timestamp: new Date().toISOString(),
    };
  }
}
