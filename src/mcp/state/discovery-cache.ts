/**
 * Discovery Cache for Q-SYS Components and Controls
 * 
 * Lightweight caching strategy:
 * - Component names are cached after first discovery (small memory footprint)
 * - Controls are fetched on-demand and cached temporarily (avoids bulk loading)
 * - Automatic invalidation on connection events (ensures fresh data after reconnect)
 * - TTL-based expiration for controls (30 seconds default)
 */

import { EventEmitter } from 'events';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { QSysComponentControlsResponse, QSysComponentInfo } from '../types/qsys-api-responses.js';

/**
 * Lightweight cached component - just name and type
 */
export interface CachedComponent {
  name: string;
  type: string;
  timestamp: number;
}

/**
 * Cached control information with metadata
 * Only cached on-demand when specifically requested
 */
export interface CachedControl {
  name: string;
  component: string;
  type: string;
  value?: number | string | boolean;
  metadata?: {
    min?: number;
    max?: number;
    stringMin?: string;
    stringMax?: string;
    units?: string;
    step?: number;
    valueType?: string;
    direction?: string;
    position?: unknown;
  };
  timestamp: number;
  ttl: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Component list TTL in milliseconds (default: 300000 - 5 minutes) */
  componentListTtl?: number;
  /** Control cache TTL in milliseconds (default: 30000 - 30 seconds) */
  controlCacheTtl?: number;
  /** Maximum number of component control sets to cache (default: 50) */
  maxCachedControlSets?: number;
  /** Whether to cache control values (default: false) */
  cacheValues?: boolean;
}

/**
 * Discovery cache manager
 */
export class DiscoveryCache extends EventEmitter {
  // Lightweight component list - just names and types
  private componentList: CachedComponent[] | null = null;
  private componentListTimestamp = 0;
  
  // On-demand control cache with LRU eviction
  private readonly controls = new Map<string, Map<string, CachedControl>>();
  private readonly controlAccessOrder: string[] = [];
  
  private readonly config: Required<CacheConfig>;
  private isConnected = false;

  constructor(config: CacheConfig = {}) {
    super();
    this.config = {
      componentListTtl: config.componentListTtl ?? 300000, // 5 minutes for component list
      controlCacheTtl: config.controlCacheTtl ?? 30000,    // 30 seconds for controls
      maxCachedControlSets: config.maxCachedControlSets ?? 50, // Only cache 50 component control sets
      cacheValues: config.cacheValues ?? false,
    };
  }

  /**
   * Handle connection events - clear cache on disconnect/reconnect
   */
  onConnectionStateChange(connected: boolean): void {
    if (!connected && this.isConnected) {
      // Connection lost - clear cache
      logger.info('Connection lost, clearing discovery cache');
      this.clear();
    } else if (connected && !this.isConnected) {
      // Connection restored - cache will rebuild on demand
      logger.info('Connection restored, discovery cache ready for rebuild');
    }
    this.isConnected = connected;
  }

  /**
   * Get cached components list (lightweight - just names and types)
   */
  getComponents(): CachedComponent[] | null {
    // Check if component list is still valid
    if (!this.componentList || 
        Date.now() - this.componentListTimestamp > this.config.componentListTtl) {
      return null;
    }
    
    return this.componentList;
  }

  /**
   * Cache components list (lightweight - only store names and types)
   */
  setComponents(components: QSysComponentInfo[]): void {
    // Only cache component names and types (lightweight)
    this.componentList = components.map(comp => ({
      name: comp.Name,
      type: comp.Type,
      timestamp: Date.now(),
    }));
    
    this.componentListTimestamp = Date.now();
    
    logger.debug('Cached component list (lightweight)', {
      count: this.componentList.length,
      ttl: this.config.componentListTtl
    });
  }

  /**
   * Get cached controls for a component (on-demand caching)
   */
  getControls(componentName: string): CachedControl[] | null {
    this.cleanExpiredControls();
    
    const componentControls = this.controls.get(componentName);
    if (!componentControls || componentControls.size === 0) {
      return null;
    }

    // Update access order for LRU
    this.updateAccessOrder(componentName);

    // Return all non-expired controls
    const controls = Array.from(componentControls.values()).filter(ctrl => 
      Date.now() - ctrl.timestamp < ctrl.ttl
    );

    return controls.length > 0 ? controls : null;
  }

  /**
   * Cache controls for a component (on-demand, with LRU eviction)
   */
  setControls(componentName: string, response: QSysComponentControlsResponse): void {
    const timestamp = Date.now();

    // Enforce cache size limit with LRU eviction
    if (this.controls.size >= this.config.maxCachedControlSets && !this.controls.has(componentName)) {
      // Evict least recently used component controls
      const lruComponent = this.controlAccessOrder.shift();
      if (lruComponent) {
        this.controls.delete(lruComponent);
        logger.debug('Evicted LRU component controls from cache', { component: lruComponent });
      }
    }

    // Get or create component control map
    let componentControls = this.controls.get(componentName);
    if (!componentControls) {
      componentControls = new Map<string, CachedControl>();
      this.controls.set(componentName, componentControls);
    }

    // Clear existing controls for this component
    componentControls.clear();

    // Cache each control with metadata
    for (const ctrl of response.Controls) {
      const cachedControl: CachedControl = {
        name: ctrl.Name,
        component: componentName,
        type: this.inferControlType(ctrl),
        timestamp,
        ttl: this.config.controlCacheTtl,
      };

      // Optionally cache value (usually disabled for performance)
      if (this.config.cacheValues && ctrl.Value !== undefined) {
        cachedControl.value = ctrl.Value;
      }

      // Extract and cache metadata
      const metadata: CachedControl['metadata'] = {};
      
      if (ctrl.ValueMin !== undefined) metadata.min = ctrl.ValueMin;
      if (ctrl.ValueMax !== undefined) metadata.max = ctrl.ValueMax;
      if (ctrl.StringMin) metadata.stringMin = ctrl.StringMin;
      if (ctrl.StringMax) metadata.stringMax = ctrl.StringMax;
      if (ctrl.Direction) metadata.direction = ctrl.Direction;
      if (ctrl.Position !== undefined) metadata.position = ctrl.Position;

      // Check for additional properties (legacy format)
      const ctrlWithProps = ctrl as typeof ctrl & {
        Properties?: {
          MinValue?: number;
          MaxValue?: number;
          Units?: string;
          Step?: number;
          ValueType?: string;
        }
      };

      if (ctrlWithProps.Properties) {
        const props = ctrlWithProps.Properties;
        if (props.MinValue !== undefined) metadata.min = props.MinValue;
        if (props.MaxValue !== undefined) metadata.max = props.MaxValue;
        if (props.Units) metadata.units = props.Units;
        if (props.Step !== undefined) metadata.step = props.Step;
        if (props.ValueType) metadata.valueType = props.ValueType;
      }

      // Only add metadata if we found any
      if (Object.keys(metadata).length > 0) {
        cachedControl.metadata = metadata;
      }

      componentControls.set(ctrl.Name, cachedControl);
    }

    // Update access order
    this.updateAccessOrder(componentName);

    logger.debug('Cached controls for component (on-demand)', {
      component: componentName,
      count: componentControls.size,
      ttl: this.config.controlCacheTtl,
      totalCachedComponents: this.controls.size
    });
  }

  /**
   * Update LRU access order
   */
  private updateAccessOrder(componentName: string): void {
    const index = this.controlAccessOrder.indexOf(componentName);
    if (index > -1) {
      this.controlAccessOrder.splice(index, 1);
    }
    this.controlAccessOrder.push(componentName);
  }

  /**
   * Check if a specific control exists in cache
   */
  hasControl(componentName: string, controlName: string): boolean | null {
    this.cleanExpiredControls();
    
    const componentControls = this.controls.get(componentName);
    if (!componentControls) {
      return null; // Unknown - not cached
    }

    const control = componentControls.get(controlName);
    if (!control) {
      return false; // Definitely doesn't exist
    }

    // Check if expired
    if (Date.now() - control.timestamp >= control.ttl) {
      componentControls.delete(controlName);
      return null; // Expired - unknown
    }

    return true; // Exists and valid
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.componentList = null;
    this.componentListTimestamp = 0;
    this.controls.clear();
    this.controlAccessOrder.length = 0;
    logger.debug('Discovery cache cleared');
  }

  /**
   * Clean expired control entries
   */
  private cleanExpiredControls(): void {
    const now = Date.now();

    // Clean expired controls
    for (const [componentName, controlMap] of this.controls.entries()) {
      let hasExpired = false;
      
      for (const [controlName, control] of controlMap.entries()) {
        if (now - control.timestamp >= control.ttl) {
          controlMap.delete(controlName);
          hasExpired = true;
        }
      }
      
      // Remove empty component entries and update access order
      if (controlMap.size === 0) {
        this.controls.delete(componentName);
        const index = this.controlAccessOrder.indexOf(componentName);
        if (index > -1) {
          this.controlAccessOrder.splice(index, 1);
        }
      } else if (hasExpired) {
        logger.debug('Cleaned expired controls', { 
          component: componentName, 
          remainingControls: controlMap.size 
        });
      }
    }
  }

  /**
   * Infer control type from control properties
   */
  private inferControlType(control: QSysComponentControlsResponse['Controls'][0]): string {
    const name = control.Name;
    if (!name) return 'unknown';
    const lowerName = name.toLowerCase();

    // Infer type from control name patterns
    if (lowerName.includes('gain') || lowerName.includes('level')) return 'gain';
    if (lowerName.includes('mute')) return 'mute';
    if (lowerName.includes('input_select') || lowerName.includes('input.select')) {
      return 'input_select';
    }
    if (lowerName.includes('output_select') || lowerName.includes('output.select')) {
      return 'output_select';
    }

    // Check control Type property
    if (control.Type === 'Boolean') return 'mute';
    if (control.Type === 'Float' && control.String?.includes('dB')) return 'gain';

    return 'unknown';
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    componentListCached: boolean;
    componentCount: number;
    cachedControlSets: number;
    totalControlCount: number;
    cacheUtilization: number;
    oldestControlSet?: string;
  } {
    this.cleanExpiredControls();

    let totalControlCount = 0;
    for (const controlMap of this.controls.values()) {
      totalControlCount += controlMap.size;
    }

    return {
      componentListCached: !!this.componentList && 
                          Date.now() - this.componentListTimestamp < this.config.componentListTtl,
      componentCount: this.componentList?.length ?? 0,
      cachedControlSets: this.controls.size,
      totalControlCount,
      cacheUtilization: (this.controls.size / this.config.maxCachedControlSets) * 100,
      ...(this.controlAccessOrder[0] ? { oldestControlSet: this.controlAccessOrder[0] } : {}),
    };
  }
}

// Export singleton instance
export const discoveryCache = new DiscoveryCache();