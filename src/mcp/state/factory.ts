/**
 * State Repository Factory - BUG-132 Fix
 * 
 * Factory to create simplified state repository instances
 */

import type { IStateRepository, CacheConfig } from './repository.js';
import { SimpleStateManager } from './simple-state-manager.js';
import { globalLogger as logger } from '../../shared/utils/logger.js';

/**
 * Create a state repository instance
 * 
 * This factory allows us to switch between implementations:
 * - 'simple': New simplified implementation (default)
 * - 'legacy': Old complex implementation (for backwards compatibility)
 */
export async function createStateRepository(
  type: 'simple' | 'legacy' = 'simple',
  config?: Partial<CacheConfig>
): Promise<IStateRepository> {
  logger.info('Creating state repository', { type });

  if (type === 'simple') {
    const manager = new SimpleStateManager();
    await manager.initialize({
      maxEntries: 1000,
      ttlMs: 3600000, // 1 hour
      cleanupIntervalMs: 60000, // 1 minute
      enableMetrics: true,
      persistenceEnabled: false,
      ...config,
    });
    return manager;
  }

  // Legacy mode deprecated - always use simple implementation
  if (type === 'legacy') {
    logger.warn('Legacy state repository is deprecated - using simple implementation instead');
    // Fall back to simple implementation
    const manager = new SimpleStateManager();
    await manager.initialize({
      maxEntries: 1000,
      ttlMs: 3600000,
      cleanupIntervalMs: 60000,
      enableMetrics: true,
      persistenceEnabled: false,
      ...config,
    });
    return manager;
  }

  throw new Error(`Unknown state repository type: ${type}`);
}

/**
 * Get default state repository configuration
 */
export function getDefaultStateConfig(): CacheConfig {
  return {
    maxEntries: 1000,
    ttlMs: 3600000, // 1 hour
    cleanupIntervalMs: 60000, // 1 minute
    enableMetrics: true,
    persistenceEnabled: false,
  };
}