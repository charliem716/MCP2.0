#!/bin/bash

echo "Fixing remaining .js imports..."

# Fix all remaining .js imports
find . -name "*.test.ts" -type f | while read -r file; do
  if grep -q "\.js['\"]" "$file"; then
    echo "Fixing: $file"
    # Remove .js extensions from imports and requires
    sed -i '' "s/\(from ['\"][^'\"]*\)\.js\(['\"];\?\)/\1\2/g" "$file"
    sed -i '' "s/\(import(['\"][^'\"]*\)\.js\(['\"])\)/\1\2/g" "$file"
    sed -i '' "s/\(jest\.mock(['\"][^'\"]*\)\.js\(['\"])\)/\1\2/g" "$file"
    sed -i '' "s/\(require(['\"][^'\"]*\)\.js\(['\"])\)/\1\2/g" "$file"
  fi
done

echo "Done fixing .js imports"