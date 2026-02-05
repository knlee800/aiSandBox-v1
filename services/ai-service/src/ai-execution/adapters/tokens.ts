/**
 * Dependency Injection Tokens
 *
 * Stage C2-D: Adapter DI Token
 *
 * Defines injection tokens for AI adapter dependency injection.
 */

/**
 * AI_ADAPTER
 *
 * Injection token for AIAdapter interface.
 * Used to inject the active AI adapter implementation.
 *
 * Usage:
 * @Inject(AI_ADAPTER) private readonly adapter: AIAdapter
 */
export const AI_ADAPTER = 'AI_ADAPTER';

/**
 * AI_PROVIDER_CONFIG
 *
 * Injection token for AIProviderConfig.
 * Used to configure which AI adapter should be instantiated.
 *
 * Stage C2-G: Configuration-driven adapter selection
 *
 * Optional: If not provided, defaults to stub adapter.
 *
 * Usage:
 * @Inject(AI_PROVIDER_CONFIG) private readonly config: AIProviderConfig
 */
export const AI_PROVIDER_CONFIG = 'AI_PROVIDER_CONFIG';
