import { Injectable, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/**
 * ContainerManagerHttpClient
 * Internal HTTP client for calling container-manager service
 * Handles session lifecycle operations (start, stop, etc.)
 * Task 10B1: Added billing export methods
 */
@Injectable()
export class ContainerManagerHttpClient implements OnModuleInit {
  private readonly baseUrl: string;
  private readonly internalServiceKey: string;
  private axiosInstance: AxiosInstance;
  private isDisabled: boolean = false;

  constructor() {
    // Read configuration from environment
    this.baseUrl =
      process.env.CONTAINER_MANAGER_URL || 'http://localhost:4002';
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY || '';

    // Create axios instance with default config
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Validate configuration on module initialization
   * Fail-fast if INTERNAL_SERVICE_KEY is missing (production only)
   * In development mode, allow soft-disable if key is missing
   */
  onModuleInit() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!this.internalServiceKey) {
      if (isDevelopment) {
        // Development mode: soft-disable instead of crashing
        this.isDisabled = true;
        console.warn(
          '⚠️  [DEV MODE] ContainerManagerHttpClient disabled (INTERNAL_SERVICE_KEY not set)',
        );
        console.warn('⚠️  This is allowed ONLY in development mode');
        return;
      }

      // Production mode: fail-fast (unchanged behavior)
      throw new Error(
        'FATAL: INTERNAL_SERVICE_KEY environment variable is required for ContainerManagerHttpClient',
      );
    }
  }

  /**
   * Start a session container in container-manager
   * Calls POST /api/sessions/:sessionId/start
   * @param sessionId - Session UUID to start
   * @throws Error on HTTP failure (fail-fast, no retries)
   */
  async startSession(sessionId: string): Promise<void> {
    if (this.isDisabled) {
      throw new Error(
        'ContainerManagerHttpClient is disabled (development mode, no INTERNAL_SERVICE_KEY)',
      );
    }

    try {
      await this.axiosInstance.post(
        `/api/sessions/${sessionId}/start`,
        {}, // No request body required
        {
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      );
    } catch (error) {
      // Fail-fast: re-throw without logging secrets
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 'unknown';
        const message = error.response?.data?.message || error.message;
        throw new Error(
          `Failed to start session ${sessionId} in container-manager: HTTP ${status} - ${message}`,
        );
      }
      throw new Error(
        `Failed to start session ${sessionId} in container-manager: ${error}`,
      );
    }
  }

  /**
   * Stop a session in container-manager
   * Calls POST /api/sessions/:sessionId/stop
   * @param sessionId - Session UUID to stop
   * @throws Error on HTTP failure (fail-fast, no retries)
   */
  async stopSession(sessionId: string): Promise<void> {
    if (this.isDisabled) {
      throw new Error(
        'ContainerManagerHttpClient is disabled (development mode, no INTERNAL_SERVICE_KEY)',
      );
    }

    try {
      await this.axiosInstance.post(
        `/api/sessions/${sessionId}/stop`,
        {}, // No request body required
        {
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      );
    } catch (error) {
      // Fail-fast: re-throw without logging secrets
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 'unknown';
        const message = error.response?.data?.message || error.message;
        throw new Error(
          `Failed to stop session ${sessionId} in container-manager: HTTP ${status} - ${message}`,
        );
      }
      throw new Error(
        `Failed to stop session ${sessionId} in container-manager: ${error}`,
      );
    }
  }

  /**
   * Get billing usage export from container-manager
   * Task 10B1: Call billing export endpoint
   * Calls GET /api/internal/billing-export/user/:userId/usage?startDate=...&endDate=...
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Billing usage export data
   * @throws Error on HTTP failure (fail-soft, returns null on error)
   */
  async getBillingUsageExport(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<BillingUsageExport | null> {
    if (this.isDisabled) {
      console.warn(
        '[DEV MODE] ContainerManagerHttpClient is disabled, getBillingUsageExport returning null',
      );
      return null;
    }

    try {
      const response = await this.axiosInstance.get(
        `/api/internal/billing-export/user/${userId}/usage`,
        {
          params: {
            startDate,
            endDate,
          },
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      );
      return response.data;
    } catch (error) {
      // Fail-soft: log error and return null
      // Invoice drafting should continue with zeros
      console.error(
        `[Task 10B1] Failed to get billing export for user ${userId}:`,
        axios.isAxiosError(error) ? error.response?.status : error,
      );
      return null;
    }
  }
}

/**
 * BillingUsageExport interface
 * Task 10B1: Type definition for billing export response
 */
export interface BillingUsageExport {
  userId: string;
  planType: string;
  period: {
    start: string;
    end: string;
  };
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costUsd: number;
  providerBreakdown: Array<{
    provider: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  }>;
  governanceEvents: {
    total: number;
    byReason: Array<{
      reason: string;
      count: number;
    }>;
  };
  sessionCounts: {
    total: number;
    active: number;
    terminated: number;
    terminationBreakdown: Array<{
      reason: string;
      count: number;
    }>;
  };
  status: 'COMPLETE' | 'INCOMPLETE';
}
