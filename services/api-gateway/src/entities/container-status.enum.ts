/**
 * Container Status Enumeration
 * Tracks the lifecycle state of a sandbox container
 */
export enum ContainerStatus {
  /**
   * Container is being created/initialized
   */
  CREATING = 'creating',

  /**
   * Container is running and active
   */
  RUNNING = 'running',

  /**
   * Container has been stopped
   */
  STOPPED = 'stopped',

  /**
   * Container encountered an error during lifecycle
   */
  ERROR = 'error',
}
