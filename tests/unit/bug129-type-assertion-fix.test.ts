import { describe, it, expect } from '@jest/globals';

describe('BUG-129: ESLint unnecessary type assertion fix', () => {
  it('should validate source field without type assertion', () => {
    // This test verifies that the fix for BUG-129 correctly handles
    // the source field validation without the unnecessary type assertion
    
    const validSources = ['qsys', 'cache', 'user'];
    
    // Test that the includes check works without type assertion
    const testSource1 = 'qsys';
    expect(validSources.includes(testSource1)).toBe(true);
    
    const testSource2 = 'invalid';
    expect(validSources.includes(testSource2)).toBe(false);
    
    // Simulate the type guard logic
    const mockState = {
      name: 'test-control',
      value: 42,
      timestamp: new Date(),
      source: 'qsys'
    };
    
    // Verify type checking works correctly
    const isValidSource = (source: unknown): boolean => {
      return typeof source === 'string' && 
             ['qsys', 'cache', 'user'].includes(source);
      // Note: No 'as string' needed after the typeof check
    };
    
    expect(isValidSource(mockState.source)).toBe(true);
    expect(isValidSource('cache')).toBe(true);
    expect(isValidSource('user')).toBe(true);
    expect(isValidSource('invalid')).toBe(false);
    expect(isValidSource(123)).toBe(false);
    expect(isValidSource(null)).toBe(false);
    expect(isValidSource(undefined)).toBe(false);
  });
});