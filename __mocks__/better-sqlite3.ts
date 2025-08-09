import * as fs from 'fs';

// Export a factory function that returns a mock Database class
export default function Database(path: string, options?: any) {
  let insertCount = 0;
  
  // Check if the database file is corrupted (for testing)
  let isCorrupted = false;
  if (fs.existsSync(path)) {
    const data = fs.readFileSync(path);
    if (data.length > 0 && data[0] === 0xFF) {
      isCorrupted = true;
    }
  }
  
  return {
    path,
    options,
    prepare: (query: string) => ({
      run: () => {
        if (query.includes('INSERT')) {
          insertCount++;
        }
        return { lastInsertRowid: 1, changes: 1 };
      },
      get: (param?: any) => {
        // For integrity check
        if (query.includes('PRAGMA integrity_check')) {
          return { integrity_check: isCorrupted ? 'corrupt' : 'ok' };
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
      all: (...params: any[]) => {
        // For event queries, return mock events
        if (query.includes('SELECT * FROM events')) {
          const events = [];
          const now = Date.now();
          
          // Check if there are time range parameters
          let startTime = 0;
          let endTime = now;
          
          if (query.includes('timestamp >= ?') && params.length > 0) {
            startTime = params[0] as number;
          }
          if (query.includes('timestamp <= ?')) {
            endTime = params[params.length - 1] as number;
          }
          
          for (let i = 0; i < 100; i++) {
            const eventTime = now - (i * 1000);
            // Only include events within the time range
            if (eventTime >= startTime && eventTime <= endTime) {
              events.push({
                timestamp: eventTime,
                change_group_id: 'test-group',
                control_path: `Component.Control${i}`,
                component_name: 'Component',
                control_name: `Control${i}`,
                value: Math.random() * 100,
                string_value: `Value ${i}`,
                source: 'test'
              });
            }
          }
          return events;
        }
        return [];
      }
    }),
    exec: () => undefined,
    close: () => undefined,
    pragma: () => undefined,
    transaction: (fn: Function) => (data: any) => fn(data),
    backup: async (path: string) => {
      // Mock backup creation - create an empty file
      fs.writeFileSync(path, '');
      return Promise.resolve();
    }
  };
}