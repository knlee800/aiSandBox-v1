import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Observable, Subject } from 'rxjs';

@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post('chat')
  async chat(
    @Body('sessionId') sessionId: string,
    @Body('userId') userId: string,
    @Body('message') message: string,
  ) {
    return this.messagesService.handleUserMessage(sessionId, userId, message);
  }

  @Sse('chat/stream')
  streamChat(
    @Body('sessionId') sessionId: string,
    @Body('userId') userId: string,
    @Body('message') message: string,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    this.messagesService.streamUserMessage(
      sessionId,
      userId,
      message,
      (chunk: string) => {
        subject.next({ data: { type: 'chunk', content: chunk } });
      },
    ).then((result) => {
      subject.next({ data: { type: 'done', ...result } });
      subject.complete();
    }).catch((error) => {
      subject.error(error);
    });

    return subject.asObservable();
  }

  @Post('health')
  health() {
    return {
      status: 'ok',
      service: 'messages',
      timestamp: new Date().toISOString(),
    };
  }
}
