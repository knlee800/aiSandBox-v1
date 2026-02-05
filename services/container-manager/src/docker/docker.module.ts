import { Module } from '@nestjs/common';
import { DockerRuntimeService } from './docker-runtime.service';
import { GovernanceConfig } from '../config/governance.config';

/**
 * DockerModule
 * Provides Docker container runtime capabilities
 * Used for session isolation via Docker containers
 * Task 8.2A: Exports GovernanceConfig for exec concurrency enforcement
 */
@Module({
  providers: [DockerRuntimeService, GovernanceConfig],
  exports: [DockerRuntimeService, GovernanceConfig],
})
export class DockerModule {}
