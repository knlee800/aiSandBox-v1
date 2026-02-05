import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-session')
  handleJoinSession(client: Socket, sessionId: string) {
    client.join(`session:${sessionId}`);
    this.logger.log(`Client ${client.id} joined session ${sessionId}`);
    return { success: true };
  }

  @SubscribeMessage('leave-session')
  handleLeaveSession(client: Socket, sessionId: string) {
    client.leave(`session:${sessionId}`);
    this.logger.log(`Client ${client.id} left session ${sessionId}`);
    return { success: true };
  }

  // Methods to emit events from services

  emitFileChange(sessionId: string, data: any) {
    this.server.to(`session:${sessionId}`).emit('file-changed', data);
    this.logger.debug(`Emitted file-changed to session ${sessionId}`);
  }

  emitCheckpointCreated(sessionId: string, data: any) {
    this.server.to(`session:${sessionId}`).emit('checkpoint-created', data);
    this.logger.debug(`Emitted checkpoint-created to session ${sessionId}`);
  }

  emitTokenUpdate(sessionId: string, data: any) {
    this.server.to(`session:${sessionId}`).emit('token-updated', data);
    this.logger.debug(`Emitted token-updated to session ${sessionId}`);
  }
}
