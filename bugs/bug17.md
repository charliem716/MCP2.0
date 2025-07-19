# BUG-017: Q-SYS Tools Return Mock Data Instead of Real Responses

## Status
🔴 **OPEN**

## Priority
**HIGH**

## Component
Q-SYS Tools (Phase 2.2)

## Description
All Q-SYS control tools contain hardcoded mock data instead of processing real responses from the Q-SYS Core. This makes the tools non-functional for actual Q-SYS control.

## Evidence

### components.ts
```typescript
private parseComponentsResponse(response: any): QSysComponent[] {
  // Mock response for Phase 2.2
  return [
    { name: "MainMixer", type: "mixer.nxn", controls: 24 },
    { name: "MicGain1", type: "gain", controls: 3 },
    // ... more hardcoded data
  ];
}
```

### controls.ts
```typescript
private getMockControlValue(controlName: string): number | string | boolean {
  // Generate realistic mock values based on control name
  if (controlName.includes('gain')) return Math.round((Math.random() * 30 - 15) * 10) / 10;
  if (controlName.includes('mute')) return Math.random() > 0.5;
  // ... more mock logic
}
```

### status.ts
```typescript
private parseStatusResponse(response: any): QSysCoreStatus {
  // Mock realistic Q-SYS Core status for Phase 2.2
  return {
    coreInfo: {
      name: "Q-SYS-Core-110f",
      serialNumber: "12345-67890",
      firmwareVersion: "9.10.2.0-2024.03.21",
      // ... all hardcoded
    }
  };
}
```

## Impact
- Tools don't reflect actual Q-SYS system state
- Cannot control real Q-SYS components
- Phase 2 deliverable "All Q-SYS control tools working" is not met
- Users get false/random data
- No real-time updates from Q-SYS Core

## Root Cause
The tools were implemented with placeholder logic for Phase 2.2, but the real QRWC response parsing was never added. Comments indicate this was intentional but temporary.

## Recommended Solution

### 1. Parse Real QRWC Responses
Update each tool to parse actual Q-SYS responses:

```typescript
// components.ts
private parseComponentsResponse(response: any): QSysComponent[] {
  // Parse real Q-SYS response structure
  if (!response?.result?.components) {
    throw new Error('Invalid components response');
  }
  
  return response.result.components.map((comp: any) => ({
    name: comp.name,
    type: comp.type,
    controls: comp.controls?.length || 0
  }));
}
```

### 2. Use Official Client Methods
The official QRWC client already has methods for these operations:

```typescript
// Instead of mock client.sendCommand()
const components = await this.qrwcClient.getComponents();
const controls = await this.qrwcClient.getControls(componentName);
const status = await this.qrwcClient.getStatus();
```

### 3. Remove All Mock Generators
Delete all `getMock*`, `generateMock*`, and hardcoded response methods.

### 4. Add Response Validation
Use Zod schemas to validate real responses:

```typescript
const QSysComponentResponseSchema = z.object({
  result: z.object({
    components: z.array(z.object({
      name: z.string(),
      type: z.string(),
      controls: z.array(z.any()).optional()
    }))
  })
});
```

## Files to Update
1. `src/mcp/tools/components.ts` - Remove mock component list
2. `src/mcp/tools/controls.ts` - Remove mock control values
3. `src/mcp/tools/status.ts` - Remove mock status data
4. `src/mcp/tools/base.ts` - Ensure real client usage

## Verification Steps
1. Connect to real Q-SYS Core
2. List components - should show actual system components
3. Get control values - should reflect real control states
4. Set control values - should change actual system
5. Query status - should show real core information

## Acceptance Criteria
- [ ] All mock data generators removed
- [ ] Tools parse real QRWC responses
- [ ] Response validation implemented
- [ ] Tools control actual Q-SYS system
- [ ] Real-time updates working 