import { Module } from '@nestjs/common';
import { SessionsModule } from './sessions/sessions.module';
import { FilesModule } from './files/files.module';
import { GitModule } from './git/git.module';
import { ExecutorModule } from './executor/executor.module';
import { PreviewModule } from './preview/preview.module';
import { UsageModule } from './usage/usage.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    SessionsModule,
    FilesModule,
    GitModule,
    ExecutorModule,
    PreviewModule,
    UsageModule,
    BillingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
