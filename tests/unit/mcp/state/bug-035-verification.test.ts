import { ChangeGroupManager } from "../../../../src/mcp/state/change-group-manager.js";
import { CacheChangeGroupManager } from "../../../../src/mcp/state/cache/change-groups.js";

describe("BUG-035: Duplicate ChangeGroupManager Verification", () => {
  test("ChangeGroupManager and CacheChangeGroupManager should be distinct classes", () => {
    // Verify they are different classes
    expect(ChangeGroupManager).not.toBe(CacheChangeGroupManager);
    
    // Verify class names are different
    expect(ChangeGroupManager.name).toBe("ChangeGroupManager");
    expect(CacheChangeGroupManager.name).toBe("CacheChangeGroupManager");
  });

  test("ChangeGroupManager should have transaction-based methods", () => {
    // Verify the sophisticated ChangeGroupManager has expected methods
    const methods = Object.getOwnPropertyNames(ChangeGroupManager.prototype);
    
    // Check for transaction-related methods
    expect(methods).toContain("executeChangeGroup");
    expect(methods).toContain("getExecutionResult");
    expect(methods).toContain("getActiveChangeGroups");
    expect(methods).toContain("cancelChangeGroup");
    expect(methods).toContain("getStatistics");
  });

  test("CacheChangeGroupManager should have cache-specific methods", () => {
    // Verify the cache-specific manager has expected methods
    const methods = Object.getOwnPropertyNames(CacheChangeGroupManager.prototype);
    
    // Check for cache-specific methods
    expect(methods).toContain("createChangeGroup");
    expect(methods).toContain("getChangeGroup");
    expect(methods).toContain("updateChangeGroupStatus");
    expect(methods).toContain("cleanupChangeGroups");
    expect(methods).toContain("startChangeGroupCleanup");
    expect(methods).toContain("stopChangeGroupCleanup");
  });

  test("Both managers should have distinct purposes documented", () => {
    // This test verifies that the classes exist and can be instantiated
    // The distinct naming makes their purposes clear
    expect(() => {
      // CacheChangeGroupManager requires a CoreCache instance
      const cacheInstance = { emit: () => {} };
      new CacheChangeGroupManager(cacheInstance as any);
    }).not.toThrow();
  });
});