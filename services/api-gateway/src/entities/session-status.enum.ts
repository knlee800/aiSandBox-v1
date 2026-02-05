/**
 * Session status enumeration
 * - pending: Session created, container not yet started
 * - active: Session running with active container
 * - stopped: Session stopped by user
 * - expired: Session expired due to timeout
 * - error: Session encountered an error
 */
export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  STOPPED = 'stopped',
  EXPIRED = 'expired',
  ERROR = 'error',
}
