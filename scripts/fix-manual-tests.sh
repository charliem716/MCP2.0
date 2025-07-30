#!/bin/bash

# Convert manual test files to proper Jest test structure
echo "Converting manual test files to Jest test structure..."

# Find all manual test files that execute code at top level
find tests/manual -name "*.test.ts" -type f | while read -r file; do
  # Check if file has top-level async code execution
  if grep -q "^testControlSet();" "$file" || \
     grep -q "^runTests();" "$file" || \
     grep -q "^testGracefulShutdownTimeout();" "$file" || \
     grep -q "^main();" "$file" || \
     grep -q "^runTest();" "$file" || \
     grep -q "^checkESLint();" "$file" || \
     grep -q "console\.log.*Testing.*;" "$file" | head -1; then
    
    echo "Converting: $file"
    
    # Create a temporary file with proper Jest structure
    temp_file="${file}.temp"
    
    # Extract the main function name (if exists)
    main_func=$(grep -E "^(async function |function |const )\w+\s*\(" "$file" | head -1 | sed -E 's/^(async function |function |const )(\w+).*/\2/')
    
    # Write the converted test
    {
      # Keep imports
      sed -n '1,/^async function\|^function\|^const.*=.*async/p' "$file" | sed '$d'
      
      # Add describe block
      echo ""
      echo "describe('$(basename "$file" .test.ts)', () => {"
      echo "  it('should run the test scenario', async () => {"
      
      # Extract the test logic
      echo "    // Test implementation"
      sed -n '/^async function\|^function\|^const.*=.*async/,$p' "$file" | \
        sed 's/console\.log(/\/\/ console.log(/g' | \
        sed 's/console\.error(/\/\/ console.error(/g' | \
        sed 's/process\.exit([0-9]);//g'
      
      echo "  });"
      echo "});"
    } > "$temp_file"
    
    # Replace the original file
    mv "$temp_file" "$file"
  fi
done

echo "Conversion complete!"