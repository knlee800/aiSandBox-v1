import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../entities/session.entity';
import { SessionRepository } from '../repositories/session.repository';
import { SessionService } from './session.service';
import { InternalSessionController } from './internal-session.controller';
import { SessionController } from './session.controller';
import { ContainerManagerHttpClient } from '../clients/container-manager-http.client';

/**
 * SessionModule
 * Manages sandbox session lifecycle and persistence
 */
@Module({
  imports: [
    // Register Session entity for TypeORM
    TypeOrmModule.forFeature([Session]),
  ],
  controllers: [InternalSessionController, SessionController],
  providers: [
    SessionRepository,
    SessionService,
    ContainerManagerHttpClient,
  ],
  exports: [
    SessionService,
    SessionRepository,
    ContainerManagerHttpClient,
  ],
})
export class SessionModule {}
