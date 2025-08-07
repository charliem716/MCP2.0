/**
 * State Repository Factory - BUG-132 Fix
 * 
 * Factory to create simplified state repository instances
 */

import type { IStateRepository, CacheConfig } from './repository.js';
import { SimpleStateManager } from './simple-state-manager.js';
import { MonitoredStateManager, type MonitoredStateConfig } from './monitored-state-manager.js';
import type { QRWCClientAdapter } from '../qrwc/adapter.js';
import { globalLogger as logger } from '../../shared/utils/logger.js';

/**
 * Create a state repository instance
 * 
 * This factory allows us to switch between implementations:
 * - 'simple': New simplified implementation (default)
 * - 'monitored': State manager with event monitoring capability
 * - 'legacy': Old complex implementation (for backwards compatibility)
 */
export async function createStateRepository(
  type: 'simple' | 'monitored' | 'legacy' = 'simple',
  config?: Partial<CacheConfig>,
  qrwcAdapter?: QRWCClientAdapter
): Promise<IStateRepository> {
  logger.info('Creating state repository', { type });

  // Legacy mode deprecated - always use simple implementation
  if (type === 'legacy') {
    logger.warn('Legacy state repository is deprecated - using simple implementation instead');
    type = 'simple';
  }

  if (type === 'monitored') {
    const manager = new MonitoredStateManager();
    // Extract eventMonitoring from config if it exists
    const { eventMonitoring, ...cacheConfig } = config as any || {};
    const monitoredConfig: MonitoredStateConfig = {
      maxEntries: 1000,
      ttlMs: 3600000, // 1 hour
      cleanupIntervalMs: 60000, // 1 minute
      enableMetrics: true,
      persistenceEnabled: false,
      ...cacheConfig,
      // Only use eventMonitoring if provided in config
      // No fallback to environment variables - config should be passed from centralized source
      eventMonitoring
    };
    await manager.initialize(monitoredConfig, qrwcAdapter);
    return manager as IStateRepository;
  }

  // Default to simple implementation
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