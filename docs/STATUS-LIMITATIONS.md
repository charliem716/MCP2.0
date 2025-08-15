# Status.Get Limitations

## Summary
The `query_core_status` tool retrieves system information from Q-SYS Core using the `Status.Get` command. Some fields may show "Unknown" due to Q-SYS API limitations.

## Fields Showing "Unknown"

### Always Unknown (Not provided by Q-SYS)
- `buildTime` - Q-SYS doesn't expose build timestamps
- `ntpServer` - NTP configuration not available via Status.Get
- `networkMode` - Network mode details not exposed

### Sometimes Unknown (Depends on Core model/permissions)
- `firmwareVersion` - Only available on physical Cores, not Q-SYS Designer
- `serialNumber` - Only available on physical hardware
- `ipAddress/macAddress/gateway` - May require admin permissions
- Performance metrics - May require specific Core models or permissions

## Component Count Fix (BUG-210)
The component count is now retrieved separately using `Component.GetComponents` because `Status.Get` doesn't provide this information reliably.

## Q-SYS API Reality
The Q-SYS QRWC API only exposes what the Core makes available. We cannot get data that Q-SYS doesn't provide. The "Unknown" values are not bugs - they represent the actual limitations of the Q-SYS API.

## Recommendations
1. **For Production**: Use physical Q-SYS Cores (not Designer) for complete telemetry
2. **For Testing**: Accept that some fields will be "Unknown" in Q-SYS Designer
3. **For Monitoring**: Focus on the data that IS available rather than what isn't

## Available Alternative
If you need specific telemetry not provided by Status.Get, consider:
- Using component-based monitoring (create status components in your design)
- Accessing Q-SYS Core Manager for administrative data
- Using SNMP if configured on the Core