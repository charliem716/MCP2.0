// Export a factory function that returns a mock Database class
export default function Database(path: string, options?: any) {
  return {
    path,
    options,
    prepare: (query: string) => ({
      run: () => ({ lastInsertRowid: 1, changes: 1 }),
      get: (param?: any) => {
        // For integrity check
        if (query.includes('PRAGMA integrity_check')) {
          return { integrity_check: 'ok' };
        }
        // For COUNT queries
        if (query.includes('COUNT(*)')) {
          return { count: 100 };
        }
        // For getChangeGroupById query, return null if not found
        if (query.includes('WHERE change_group_id = ?')) {
          return undefined; // No result found
        }
        // For statistics queries, return default stats
        return {
          total_events: 0,
          unique_controls: 0,
          unique_change_groups: 0,
          oldest_event: null,
          newest_event: null,
          size: 0
        };
      },
      all: () => []
    }),
    exec: () => undefined,
    close: () => undefined,
    pragma: () => undefined,
    transaction: (fn: Function) => fn(),
    backup: async (path: string) => {
      // Mock backup creation
      return Promise.resolve();
    }
  };
}