# Event Cache Query Method Migration Guide

## Breaking Change: query() is now async

As of Step 2.2, the `EventCacheManager.query()` method has been changed from synchronous to
asynchronous to support disk spillover functionality. This allows the event cache to load historical
events from disk when memory limits are exceeded.

## Migration Options

### Option 1: Use the Synchronous Compatibility Method (Quick Fix)

For immediate backwards compatibility, you can use the new `querySync()` method:

```typescript
// Before
const events = eventCache.query({ groupId: 'my-group' });

// Quick fix - use querySync (deprecated)
const events = eventCache.querySync({ groupId: 'my-group' });
```

**Note:** `querySync()` is deprecated and only queries in-memory events. It does not support disk
spillover.

### Option 2: Migrate to Async (Recommended)

Update your code to use `await` with the async `query()` method:

```typescript
// Before
const events = eventCache.query({ groupId: 'my-group' });

// After (recommended)
const events = await eventCache.query({ groupId: 'my-group' });
```

This requires making the containing function async:

```typescript
// Before
function processEvents() {
  const events = eventCache.query({ groupId: 'my-group' });
  return events.length;
}

// After
async function processEvents() {
  const events = await eventCache.query({ groupId: 'my-group' });
  return events.length;
}
```

## API Comparison

| Method        | Synchronous | Disk Support | Status     |
| ------------- | ----------- | ------------ | ---------- |
| `query()`     | No (async)  | Yes          | Current    |
| `querySync()` | Yes         | No           | Deprecated |

## Benefits of Async Query

1. **Disk Spillover**: Can retrieve events that have been offloaded to disk
2. **Better Performance**: Non-blocking I/O for large queries
3. **Future-proof**: Supports upcoming features like remote storage

## Example: Gradual Migration

```typescript
class MyService {
  private eventCache: EventCacheManager;

  // Keep sync method during migration
  getRecentEventsSync(groupId: string): CachedEvent[] {
    // Shows deprecation warning in logs
    return this.eventCache.querySync({
      groupId,
      startTime: Date.now() - 60000,
    });
  }

  // Add new async method
  async getRecentEvents(groupId: string): Promise<CachedEvent[]> {
    return await this.eventCache.query({
      groupId,
      startTime: Date.now() - 60000,
    });
  }

  // Migrate callers gradually
  async migrateExample() {
    // During migration
    const syncEvents = this.getRecentEventsSync('group1');

    // After migration
    const asyncEvents = await this.getRecentEvents('group1');
  }
}
```

## Timeline

1. **Current**: Both `query()` (async) and `querySync()` are available
2. **Next Minor Version**: `querySync()` will be marked as deprecated with warnings
3. **Next Major Version**: `querySync()` may be removed

## Need Help?

If you encounter issues during migration:

1. Check that all `query()` calls use `await`
2. Ensure containing functions are marked as `async`
3. Run tests to catch any missed conversions
4. Use TypeScript to catch type errors
