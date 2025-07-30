#!/bin/bash

echo "Fixing broken test files with syntax errors..."

# Fix test files that have broken console.log comments
find tests -name "*.test.ts" -type f | while read -r file; do
  # Check if file has broken console.log syntax
  if grep -q "// console.log(" "$file" && grep -q "^[[:space:]]*\`" "$file"; then
    echo "Fixing: $file"
    
    # Create temp file
    temp_file="${file}.temp"
    
    # Fix the file by properly handling template literals
    sed -E 's/^([[:space:]]*)\/\/ console\.log\(/\1\/\/ console.log(/g' "$file" | \
    awk '
      /\/\/ console\.log\(/ {
        in_console = 1
        print $0
        next
      }
      in_console && /^[[:space:]]*`/ {
        print "    // " $0
        next
      }
      in_console && /\);$/ {
        in_console = 0
        print $0
        next
      }
      in_console {
        print "    // " $0
        next
      }
      {
        print $0
      }
    ' > "$temp_file"
    
    mv "$temp_file" "$file"
  fi
done

echo "Done fixing broken test files"