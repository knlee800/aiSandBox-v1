import { Module } from '@nestjs/common';
import { EventsGateway } from './websocket.gateway';
import { EventsController } from './events.controller';

@Module({
  controllers: [EventsController],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebSocketModule {}
