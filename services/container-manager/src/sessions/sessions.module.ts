import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SessionsController } from './sessions.controller';
import { InternalSessionsController } from './internal-sessions.controller';
import { SessionsService } from './sessions.service';
import { ClientsModule } from '../clients/clients.module';
import { DockerModule } from '../docker/docker.module';
import { PreviewService } from '../previews/preview.service';
import { PreviewProxyService } from '../previews/preview-proxy.service';
import { InternalPreviewsController } from '../previews/internal-previews.controller';
import { InternalPreviewsProxyController } from '../previews/internal-previews-proxy.controller';
import { PreviewsController } from '../previews/previews.controller';
import { ProjectsModule } from '../projects/projects.module';
import { GovernanceEventsService } from '../governance/governance-events.service';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [HttpModule, ClientsModule, DockerModule, ProjectsModule, UsageModule],
  controllers: [
    SessionsController,
    InternalSessionsController,
    InternalPreviewsController,
    InternalPreviewsProxyController,
    PreviewsController,
  ],
  providers: [SessionsService, PreviewService, PreviewProxyService, GovernanceEventsService],
  exports: [SessionsService],
})
export class SessionsModule {}
