import { EventEmitter } from "events";
import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { IStateRepository } from "./repository.js";

/**
 * Cache invalidation strategies
 */
export enum InvalidationStrategy {
  TTL = 'ttl',                    // Time-based expiration
  Manual = 'manual',              // Manual invalidation
  EventDriven = 'event-driven',   // Based on events
  PatternBased = 'pattern-based', // Pattern matching
  Dependency = 'dependency',      // Dependency-based invalidation
  LRU = 'lru'                    // Least Recently Used eviction
}

/**
 * Invalidation trigger types
 */
export enum InvalidationTrigger {
  TimeExpired = 'time-expired',
  ValueChanged = 'value-changed',
  SystemEvent = 'system-event',
  UserAction = 'user-action',
  DependencyChanged = 'dependency-changed',
  PatternMatch = 'pattern-match',
  MemoryPressure = 'memory-pressure'
}

/**
 * Invalidation rule configuration
 */
export interface InvalidationRule {
  id: string;
  name: string;
  strategy: InvalidationStrategy;
  trigger: InvalidationTrigger;
  pattern?: RegExp;
  ttlMs?: number;
  dependencies?: string[];
  enabled: boolean;
  priority: number; // Higher number = higher priority
}

/**
 * Invalidation event data
 */
export interface InvalidationEvent {
  rule: InvalidationRule;
  controlNames: string[];
  trigger: InvalidationTrigger;
  timestamp: Date;
  reason: string;
}

/**
 * Invalidation result
 */
export interface InvalidationResult {
  ruleId: string;
  controlsInvalidated: string[];
  successCount: number;
  errorCount: number;
  executionTimeMs: number;
  errors?: string[];
}

/**
 * Cache invalidation events
 */
export enum CacheInvalidationEvent {
  RuleAdded = 'rule:added',
  RuleRemoved = 'rule:removed',
  RuleTriggered = 'rule:triggered',
  Invalidated = 'invalidated',
  Error = 'error'
}

/**
 * Advanced Cache Invalidation Manager
 * 
 * Provides sophisticated cache invalidation with:
 * - Multiple invalidation strategies (TTL, manual, event-driven, pattern-based)
 * - Configurable rules and triggers
 * - Dependency-based invalidation cascades
 * - Pattern matching for bulk operations
 * - Performance monitoring and statistics
 * - Event-driven architecture for real-time monitoring
 */
export class CacheInvalidationManager extends EventEmitter {
  private readonly rules = new Map<string, InvalidationRule>();
  private readonly dependencyGraph = new Map<string, Set<string>>();
  private invalidationCount = 0;
  private readonly startTime = Date.now();

  // Timers for TTL-based rules
  private readonly ttlTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly stateRepository: IStateRepository) {
    super();
    logger.debug('CacheInvalidationManager created');
  }

  /**
   * Add an invalidation rule
   */
  addRule(rule: InvalidationRule): void {
    if (this.rules.has(rule.id)) {
      logger.warn('Invalidation rule already exists, updating', { ruleId: rule.id });
      this.removeRule(rule.id);
    }

    this.rules.set(rule.id, rule);

    // Setup TTL timer if needed
    if (rule.strategy === InvalidationStrategy.TTL && rule.ttlMs) {
      this.setupTTLTimer(rule);
    }

    // Build dependency graph
    if (rule.dependencies) {
      for (const dependency of rule.dependencies) {
        if (!this.dependencyGraph.has(dependency)) {
          this.dependencyGraph.set(dependency, new Set());
        }
        this.dependencyGraph.get(dependency)!.add(rule.id);
      }
    }

    this.emit(CacheInvalidationEvent.RuleAdded, rule);
    
    logger.debug('Invalidation rule added', {
      ruleId: rule.id,
      strategy: rule.strategy,
      trigger: rule.trigger
    });
  }

  /**
   * Remove an invalidation rule
   */
  removeRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    // Clear TTL timer
    const timer = this.ttlTimers.get(ruleId);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(ruleId);
    }

    // Remove from dependency graph
    if (rule.dependencies) {
      for (const dependency of rule.dependencies) {
        const dependents = this.dependencyGraph.get(dependency);
        if (dependents) {
          dependents.delete(ruleId);
          if (dependents.size === 0) {
            this.dependencyGraph.delete(dependency);
          }
        }
      }
    }

    this.rules.delete(ruleId);

    this.emit(CacheInvalidationEvent.RuleRemoved, rule);
    
    logger.debug('Invalidation rule removed', { ruleId });
    return true;
  }

  /**
   * Trigger invalidation by rule ID
   */
  async triggerRule(
    ruleId: string, 
    reason = 'Manual trigger'
  ): Promise<InvalidationResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Invalidation rule not found: ${ruleId}`);
    }

    if (!rule.enabled) {
      logger.debug('Skipping disabled invalidation rule', { ruleId });
      return {
        ruleId,
        controlsInvalidated: [],
        successCount: 0,
        errorCount: 0,
        executionTimeMs: 0
      };
    }

    return await this.executeRule(rule, reason);
  }

  /**
   * Trigger invalidation by pattern
   */
  async invalidateByPattern(
    pattern: RegExp, 
    reason = 'Pattern match'
  ): Promise<string[]> {
    const allKeys = await this.stateRepository.getKeys();
    const matchingKeys = allKeys.filter(key => pattern.test(key));
    
    if (matchingKeys.length > 0) {
      await this.stateRepository.invalidateStates(matchingKeys);
      this.invalidationCount += matchingKeys.length;

      this.emit(CacheInvalidationEvent.Invalidated, {
        controlNames: matchingKeys,
        trigger: InvalidationTrigger.PatternMatch,
        reason,
        timestamp: new Date()
      });

      logger.info('Pattern-based invalidation completed', {
        pattern: pattern.toString(),
        invalidated: matchingKeys.length,
        reason
      });
    }

    return matchingKeys;
  }

  /**
   * Trigger invalidation by dependency
   */
  async invalidateByDependency(
    dependencyName: string, 
    reason = 'Dependency changed'
  ): Promise<InvalidationResult[]> {
    const dependentRules = this.dependencyGraph.get(dependencyName);
    if (!dependentRules || dependentRules.size === 0) {
      return [];
    }

    const results: InvalidationResult[] = [];
    
    // Sort rules by priority (highest first)
    const sortedRules = Array.from(dependentRules)
      .map(ruleId => this.rules.get(ruleId)!)
      .filter(rule => rule && rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      try {
        const result = await this.executeRule(rule, reason);
        results.push(result);
      } catch (error) {
        logger.error('Failed to execute dependency rule', {
          ruleId: rule.id,
          dependency: dependencyName,
          error
        });
      }
    }

    return results;
  }

  /**
   * Get all invalidation rules
   */
  getRules(): InvalidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): InvalidationRule | null {
    return this.rules.get(ruleId) || null;
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;
    
    logger.debug('Invalidation rule enabled state changed', {
      ruleId,
      enabled
    });

    return true;
  }

  /**
   * Get invalidation statistics
   */
  getStatistics() {
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled);
    const strategyCount = new Map<InvalidationStrategy, number>();
    
    for (const rule of enabledRules) {
      strategyCount.set(
        rule.strategy, 
        (strategyCount.get(rule.strategy) || 0) + 1
      );
    }

    return {
      totalRules: this.rules.size,
      enabledRules: enabledRules.length,
      disabledRules: this.rules.size - enabledRules.length,
      totalInvalidations: this.invalidationCount,
      strategyBreakdown: Object.fromEntries(strategyCount),
      dependencyCount: this.dependencyGraph.size,
      activeTTLTimers: this.ttlTimers.size,
      uptimeMs: Date.now() - this.startTime
    };
  }

  /**
   * Clear all rules and timers
   */
  clear(): void {
    // Clear all TTL timers
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();

    // Clear data structures
    this.rules.clear();
    this.dependencyGraph.clear();
    
    this.invalidationCount = 0;

    logger.debug('Cache invalidation manager cleared');
  }

  /**
   * Shutdown the invalidation manager
   */
  shutdown(): void {
    this.clear();
    this.removeAllListeners();
    logger.debug('CacheInvalidationManager shutdown completed');
  }

  // Private helper methods

  /**
   * Execute an invalidation rule
   */
  private async executeRule(
    rule: InvalidationRule, 
    reason: string
  ): Promise<InvalidationResult> {
    const startTime = Date.now();
    let controlsToInvalidate: string[] = [];

    this.emit(CacheInvalidationEvent.RuleTriggered, {
      rule,
      reason,
      timestamp: new Date()
    });

    try {
      // Determine controls to invalidate based on strategy
      switch (rule.strategy) {
        case InvalidationStrategy.TTL:
        case InvalidationStrategy.Manual:
        case InvalidationStrategy.EventDriven:
          if (rule.pattern) {
            controlsToInvalidate = await this.getControlsByPattern(rule.pattern);
          } else {
            // Invalidate all if no pattern specified
            controlsToInvalidate = await this.stateRepository.getKeys();
          }
          break;

        case InvalidationStrategy.PatternBased:
          if (!rule.pattern) {
            throw new Error(`Pattern required for pattern-based rule: ${rule.id}`);
          }
          controlsToInvalidate = await this.getControlsByPattern(rule.pattern);
          break;

        case InvalidationStrategy.Dependency:
          if (rule.dependencies) {
            controlsToInvalidate = rule.dependencies;
          }
          break;

        case InvalidationStrategy.LRU:
          // For LRU, we let the cache itself handle eviction
          controlsToInvalidate = [];
          break;

        default:
          throw new Error(`Unsupported invalidation strategy: ${rule.strategy}`);
      }

      // Execute invalidation
      if (controlsToInvalidate.length > 0) {
        await this.stateRepository.invalidateStates(controlsToInvalidate);
        this.invalidationCount += controlsToInvalidate.length;
      }

      const result: InvalidationResult = {
        ruleId: rule.id,
        controlsInvalidated: controlsToInvalidate,
        successCount: controlsToInvalidate.length,
        errorCount: 0,
        executionTimeMs: Date.now() - startTime
      };

      this.emit(CacheInvalidationEvent.Invalidated, {
        rule,
        controlNames: controlsToInvalidate,
        trigger: rule.trigger,
        timestamp: new Date(),
        reason
      } as InvalidationEvent);

      logger.debug('Invalidation rule executed successfully', {
        ruleId: rule.id,
        invalidated: controlsToInvalidate.length,
        executionTimeMs: result.executionTimeMs,
        reason
      });

      return result;

    } catch (error) {
      const result: InvalidationResult = {
        ruleId: rule.id,
        controlsInvalidated: [],
        successCount: 0,
        errorCount: 1,
        executionTimeMs: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)]
      };

      this.emit(CacheInvalidationEvent.Error, {
        error,
        rule,
        reason
      });

      logger.error('Invalidation rule execution failed', {
        ruleId: rule.id,
        error: error instanceof Error ? error.message : String(error),
        reason
      });

      return result;
    }
  }

  /**
   * Get controls matching a pattern
   */
  private async getControlsByPattern(pattern: RegExp): Promise<string[]> {
    const allKeys = await this.stateRepository.getKeys();
    return allKeys.filter(key => pattern.test(key));
  }

  /**
   * Setup TTL timer for a rule
   */
  private setupTTLTimer(rule: InvalidationRule): void {
    if (!rule.ttlMs) return;

    const timer = setTimeout(() => {
      // Use void to explicitly indicate we're not handling the promise
      void (async () => {
        try {
          await this.triggerRule(rule.id, 'TTL expired');
          
          // Reschedule if rule is still enabled
          if (rule.enabled && this.rules.has(rule.id)) {
            this.setupTTLTimer(rule);
          }
        } catch (error) {
          logger.error('TTL rule execution failed', {
            ruleId: rule.id,
            error
          });
        }
      })();
    }, rule.ttlMs);

    this.ttlTimers.set(rule.id, timer);
  }
} 