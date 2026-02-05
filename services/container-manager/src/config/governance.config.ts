import { Injectable } from '@nestjs/common';

/**
 * GovernanceConfig
 * Task 8.1A: Define Governance Config (NO behavior change)
 *
 * Centralized configuration for Phase 8 resource governance limits.
 * Reads environment variables with safe defaults.
 *
 * This config is READ-ONLY in Task 8.1A.
 * Future tasks will consume these values to enforce limits.
 */
@Injectable()
export class GovernanceConfig {
  /**
   * Session max lifetime in milliseconds
   * Default: 86400000 (24 hours)
   * After this duration, session should be marked for cleanup
   */
  readonly sessionMaxLifetimeMs: number;

  /**
   * Session idle timeout in milliseconds
   * Default: 1800000 (30 minutes)
   * After this duration of inactivity, session should be stopped
   */
  readonly sessionIdleTimeoutMs: number;

  /**
   * Container CPU limit (CPU shares)
   * Default: 0.5 (half a CPU core)
   * Docker CPUs parameter
   */
  readonly containerCpuLimit: number;

  /**
   * Container memory limit in MB
   * Default: 512 MB
   * Docker Memory parameter (converted to bytes)
   */
  readonly containerMemoryLimitMb: number;

  /**
   * Container PIDs limit
   * Default: 256
   * Maximum number of processes allowed in container
   */
  readonly containerPidsLimit: number;

  /**
   * Maximum concurrent exec operations per session
   * Default: 2
   * Prevents resource exhaustion from parallel executions
   */
  readonly maxConcurrentExecsPerSession: number;

  constructor() {
    // Session Limits
    this.sessionMaxLifetimeMs = this.parseEnvInt(
      'SESSION_MAX_LIFETIME_MS',
      86400000, // 24 hours
    );

    this.sessionIdleTimeoutMs = this.parseEnvInt(
      'SESSION_IDLE_TIMEOUT_MS',
      1800000, // 30 minutes
    );

    // Container Resource Limits
    this.containerCpuLimit = this.parseEnvFloat(
      'CONTAINER_CPU_LIMIT',
      0.5, // Half CPU
    );

    this.containerMemoryLimitMb = this.parseEnvInt(
      'CONTAINER_MEMORY_LIMIT_MB',
      512, // 512 MB
    );

    this.containerPidsLimit = this.parseEnvInt(
      'CONTAINER_PIDS_LIMIT',
      256, // 256 processes
    );

    // Execution Limits
    this.maxConcurrentExecsPerSession = this.parseEnvInt(
      'MAX_CONCURRENT_EXECS_PER_SESSION',
      2, // 2 concurrent execs
    );

    // Log configuration on startup
    console.log('✓ Governance config loaded:');
    console.log(`  - Session max lifetime: ${this.sessionMaxLifetimeMs}ms`);
    console.log(`  - Session idle timeout: ${this.sessionIdleTimeoutMs}ms`);
    console.log(`  - Container CPU limit: ${this.containerCpuLimit}`);
    console.log(`  - Container memory limit: ${this.containerMemoryLimitMb}MB`);
    console.log(`  - Container PIDs limit: ${this.containerPidsLimit}`);
    console.log(
      `  - Max concurrent execs: ${this.maxConcurrentExecsPerSession}`,
    );
  }

  /**
   * Parse environment variable as integer with fallback to default
   */
  private parseEnvInt(key: string, defaultValue: number): number {
    const value = process.env[key];

    if (!value) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
      console.warn(
        `⚠ Invalid ${key}="${value}", using default: ${defaultValue}`,
      );
      return defaultValue;
    }

    return parsed;
  }

  /**
   * Parse environment variable as float with fallback to default
   */
  private parseEnvFloat(key: string, defaultValue: number): number {
    const value = process.env[key];

    if (!value) {
      return defaultValue;
    }

    const parsed = parseFloat(value);

    if (isNaN(parsed)) {
      console.warn(
        `⚠ Invalid ${key}="${value}", using default: ${defaultValue}`,
      );
      return defaultValue;
    }

    return parsed;
  }

  /**
   * Get container memory limit in bytes (for Docker API)
   */
  getContainerMemoryLimitBytes(): number {
    return this.containerMemoryLimitMb * 1024 * 1024;
  }
}
