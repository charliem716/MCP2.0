#!/bin/bash

# Remove shebangs from TypeScript test files
echo "Removing shebangs from TypeScript test files..."

# Find all .test.ts files containing shebangs and remove them
find tests -name "*.test.ts" -type f | while read -r file; do
  if grep -q "#!/usr/bin/env node" "$file"; then
    echo "Fixing: $file"
    # Remove the shebang line
    sed -i '' '/^#!\/usr\/bin\/env node$/d' "$file"
  fi
done

echo "Done removing shebangs from test files"