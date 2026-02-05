import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ExecutorService } from './executor.service';

@Controller('executor')
export class ExecutorController {
  constructor(private executorService: ExecutorService) {}

  @Post(':sessionId/execute')
  async execute(
    @Param('sessionId') sessionId: string,
    @Body('command') command: string,
    @Body('timeout') timeout?: number
  ) {
    return this.executorService.execute(sessionId, command, timeout);
  }

  @Get('commands')
  getAllowedCommands() {
    return {
      commands: this.executorService.getAllowedCommands(),
    };
  }
}
