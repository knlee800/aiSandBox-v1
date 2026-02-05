import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GitController } from './git.controller';
import { GitService } from './git.service';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [SessionsModule, HttpModule, ClientsModule],
  controllers: [GitController],
  providers: [GitService],
  exports: [GitService],
})
export class GitModule {}
