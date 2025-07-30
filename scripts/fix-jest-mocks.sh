#!/bin/bash

echo "Fixing jest.mock() calls with .js extensions..."

# Find all test files with jest.mock calls that use .js extension
find tests -name "*.test.ts" -type f | while read -r file; do
  if grep -q "jest\.mock.*\.js'" "$file"; then
    echo "Fixing: $file"
    # Replace .js extensions in jest.mock calls with no extension
    sed -i '' "s/jest\.mock('\([^']*\)\.js'/jest.mock('\1'/g" "$file"
  fi
done

echo "Done fixing jest.mock() calls"