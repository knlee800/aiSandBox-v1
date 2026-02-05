import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { EventsGateway } from './websocket.gateway';

@Controller('events')
export class EventsController {
  constructor(private eventsGateway: EventsGateway) {}

  @Post('file-changed')
  @HttpCode(200)
  emitFileChanged(@Body() data: { sessionId: string; file: any }) {
    this.eventsGateway.emitFileChange(data.sessionId, data.file);
    return { success: true };
  }

  @Post('checkpoint-created')
  @HttpCode(200)
  emitCheckpointCreated(@Body() data: { sessionId: string; checkpoint: any }) {
    this.eventsGateway.emitCheckpointCreated(data.sessionId, data.checkpoint);
    return { success: true };
  }

  @Post('token-updated')
  @HttpCode(200)
  emitTokenUpdated(@Body() data: { sessionId: string; usage: any }) {
    this.eventsGateway.emitTokenUpdate(data.sessionId, data.usage);
    return { success: true };
  }
}
