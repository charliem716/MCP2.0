#!/usr/bin/env python3

import subprocess
import json
import time
import sys

print("🧪 Testing MCP list_controls component names\n")

# Start the MCP server
proc = subprocess.Popen(
    ['npm', 'run', 'dev'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)

# Wait for server to be ready
print("Waiting for server to start...")
start_time = time.time()
server_ready = False

while time.time() - start_time < 10:
    line = proc.stdout.readline()
    if line and "AI agents can now control" in line:
        server_ready = True
        print("✅ Server ready!\n")
        break

if not server_ready:
    print("❌ Server failed to start")
    proc.terminate()
    sys.exit(1)

# Send request
request = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
        "name": "list_controls",
        "arguments": {}
    },
    "id": 1
}

print("📤 Sending list_controls request...")
proc.stdin.write(json.dumps(request) + '\n')
proc.stdin.flush()

# Read response
print("Waiting for response...")
response_received = False
start_time = time.time()

while time.time() - start_time < 5:
    line = proc.stdout.readline()
    if not line:
        continue
    
    # Skip log lines
    if "level" in line and "message" in line:
        continue
        
    try:
        msg = json.loads(line.strip())
        if msg.get("id") == 1 and "result" in msg:
            response_received = True
            print("\n📥 Response received!")
            
            # Parse the controls
            controls = json.loads(msg["result"]["content"][0]["text"])
            print(f"Total controls: {len(controls)}\n")
            
            # Show first 3 controls with component info
            print("First 3 controls:")
            for ctrl in controls[:3]:
                print(f"- {ctrl['name']}")
                print(f"  Component: {ctrl.get('component', 'MISSING!')}")
                print(f"  Type: {ctrl.get('type', 'unknown')}")
                print(f"  Value: {ctrl.get('value', 'N/A')}\n")
            
            # Check component diversity
            components = set(ctrl.get('component', 'Unknown') for ctrl in controls)
            print(f"Unique components: {len(components)}")
            
            if len(components) > 1:
                print("✅ SUCCESS: Controls have individual component names!")
                print(f"Sample components: {', '.join(list(components)[:5])}")
            else:
                comp_name = next(iter(components))
                if comp_name == "All Components":
                    print("❌ ISSUE: All controls show 'All Components' as component")
                    print("This prevents identifying which component owns each control!")
                else:
                    print(f"❌ ISSUE: All controls have same component: {comp_name}")
            
            break
            
    except json.JSONDecodeError:
        pass

# Clean up
proc.terminate()
proc.wait()

if not response_received:
    print("❌ No response received")
    sys.exit(1)