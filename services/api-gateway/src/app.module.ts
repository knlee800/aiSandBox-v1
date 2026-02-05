import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { WebSocketModule } from './websocket/websocket.module';
import { PreviewModule } from './preview/preview.module';
import { SessionModule } from './sessions/session.module';
import { ConversationModule } from './conversations/conversation.module';
import { ChatMessageModule } from './chat-messages/chat-message.module';
import { TokenUsageModule } from './token-usage/token-usage.module';
import { GitCheckpointModule } from './git-checkpoints/git-checkpoint.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { databaseConfig } from './config/database.config';
import { InternalServiceAuthGuard } from './guards/internal-service-auth.guard';

@Module({
  imports: [
    // TypeORM configuration for PostgreSQL
    // Reads configuration from environment variables
    // Auto-loads entities matching pattern: src/**/*.entity{.ts,.js}
    TypeOrmModule.forRoot(databaseConfig()),

    AuthModule,
    HealthModule,
    WebSocketModule,
    PreviewModule,
    SessionModule,
    ConversationModule,
    ChatMessageModule,
    TokenUsageModule,
    GitCheckpointModule,
    InvoicesModule,
    PaymentsModule, // Task 10B2: Payment provider abstraction
    AdminModule, // Task 11A: Admin visibility endpoints
  ],
  controllers: [],
  providers: [
    // Global guard for internal service authentication
    // Protects all /api/internal/* routes with X-Internal-Service-Key header
    // Task 5.2A: Internal Service Authentication
    {
      provide: APP_GUARD,
      useClass: InternalServiceAuthGuard,
    },
  ],
})
export class AppModule {}
