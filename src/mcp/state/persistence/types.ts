import type { ControlState, CacheConfig } from '../repository.js';

/**
 * Persistence format (simplified to JSON only)
 */
export enum PersistenceFormat {
  JSON = 'json',
}

/**
 * Compression type (simplified to none only)
 */
export enum CompressionType {
  None = 'none',
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  filePath: string;
  format: PersistenceFormat;
  compression: CompressionType;
  backupCount: number;
  autoSave: boolean;
  saveIntervalMs: number;
  atomicWrites: boolean;
  pretty: boolean; // Pretty print JSON
}

/**
 * Persistence statistics
 */
export interface PersistenceStats {
  totalSaves: number;
  totalLoads: number;
  lastSaveTime?: Date;
  lastLoadTime?: Date;
  fileSizeBytes: number;
  saveErrors: number;
  loadErrors: number;
}

/**
 * Persisted state structure
 */
export interface PersistedState {
  version: string;
  timestamp: Date;
  controlCount: number;
  controls: Record<string, ControlState>;
  metadata?: {
    cacheConfig?: Partial<CacheConfig>;
    [key: string]: unknown;
  };
}
