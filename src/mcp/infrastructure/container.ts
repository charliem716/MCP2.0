/**
 * Simple Dependency Injection Container
 * 
 * Provides basic dependency injection functionality to decouple
 * MCP tools from specific control system implementations.
 */

import { globalLogger as logger } from '../../shared/utils/logger.js';

/**
 * Service tokens for dependency injection
 */
export const ServiceTokens = {
  CONTROL_SYSTEM: 'IControlSystem',
  EVENT_CACHE: 'IEventCacheManager',
  STATE_REPOSITORY: 'IStateRepository'
} as const;

export type ServiceToken = typeof ServiceTokens[keyof typeof ServiceTokens];

/**
 * Simple dependency injection container
 */
export class DIContainer {
  private static instance: DIContainer;
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();

  private constructor() {
    logger.debug('DIContainer initialized');
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  /**
   * Register a service instance
   */
  register<T>(token: string, service: T): void {
    logger.debug(`Registering service: ${token}`);
    this.services.set(token, service);
  }

  /**
   * Register a factory function for lazy initialization
   */
  registerFactory<T>(token: string, factory: () => T): void {
    logger.debug(`Registering factory: ${token}`);
    this.factories.set(token, factory);
  }

  /**
   * Resolve a service by token
   */
  resolve<T>(token: string): T {
    // Check if we have a direct service registration
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }

    // Check if we have a factory
    if (this.factories.has(token)) {
      const factory = this.factories.get(token)!;
      const service = factory() as T;
      // Cache the created service
      this.services.set(token, service);
      return service;
    }

    throw new Error(`Service not found: ${token}`);
  }

  /**
   * Check if a service is registered
   */
  has(token: string): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}