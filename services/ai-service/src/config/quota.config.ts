/**
 * Quota Configuration
 * Hard limits for token consumption per session
 * Task 5.1B: Hard Quota Enforcement
 */

/**
 * Maximum tokens allowed per session (input + output)
 * Hardcoded constant - no env/config yet
 *
 * Limit: 100,000 tokens per session
 * Rationale:
 * - Typical session: 10-20 messages = 20K-40K tokens
 * - Large session: 50-100 messages = 100K-200K tokens
 * - 100K provides reasonable sandbox usage without runaway costs
 * - Can be adjusted based on pricing tier (future)
 */
export const MAX_TOKENS_PER_SESSION = 100000;

/**
 * Estimated tokens for a single request (conservative)
 * Used for pre-flight quota checks
 *
 * Estimate: 8,000 tokens per request
 * Rationale:
 * - Average user message: 200 tokens
 * - Average conversation context: 2,000 tokens
 * - Average Claude response: 1,000 tokens
 * - Safety buffer: 4,800 tokens
 * - Total: ~8,000 tokens
 *
 * Conservative estimate prevents quota breaches during API call
 */
export const ESTIMATED_TOKENS_PER_REQUEST = 8000;
