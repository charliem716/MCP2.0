#!/bin/bash

# BUG-095 Fix: Coverage Comparison Script
# This script demonstrates how to measure and compare coverage between branches

echo "BUG-095 Fix: Test Coverage Measurement Tool"
echo "=========================================="

# Save current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Function to get coverage metrics
get_coverage() {
    local branch=$1
    local output_file=$2
    
    echo "Measuring coverage for branch: $branch"
    
    # Run coverage without failing on test failures
    npm run test:coverage:event-cache > /dev/null 2>&1
    
    # Extract coverage metrics if report exists
    if [ -f "coverage/coverage-summary.json" ]; then
        node -e "
        const fs = require('fs');
        const summary = JSON.parse(fs.readFileSync('coverage/coverage-summary.json'));
        const metrics = {
            lines: summary.total.lines.pct,
            statements: summary.total.statements.pct,
            functions: summary.total.functions.pct,
            branches: summary.total.branches.pct
        };
        fs.writeFileSync('$output_file', JSON.stringify(metrics, null, 2));
        console.log('Lines:      ' + metrics.lines.toFixed(2) + '%');
        console.log('Statements: ' + metrics.statements.toFixed(2) + '%');
        console.log('Functions:  ' + metrics.functions.toFixed(2) + '%');
        console.log('Branches:   ' + metrics.branches.toFixed(2) + '%');
        "
    else
        echo "ERROR: Coverage report not generated"
        return 1
    fi
}

# Get coverage for current branch
echo ""
get_coverage "$CURRENT_BRANCH" "coverage-current.json"

# Option to compare with main branch
if [ "$1" == "--compare-main" ]; then
    echo ""
    echo "Switching to main branch for baseline..."
    git checkout main > /dev/null 2>&1
    
    # Install dependencies if needed
    npm install > /dev/null 2>&1
    
    get_coverage "main" "coverage-main.json"
    
    # Switch back to original branch
    git checkout "$CURRENT_BRANCH" > /dev/null 2>&1
    
    # Compare coverage
    echo ""
    echo "Coverage Comparison:"
    echo "==================="
    node -e "
    const fs = require('fs');
    const current = JSON.parse(fs.readFileSync('coverage-current.json'));
    const baseline = JSON.parse(fs.readFileSync('coverage-main.json'));
    
    let decreased = false;
    ['lines', 'statements', 'functions', 'branches'].forEach(metric => {
        const diff = current[metric] - baseline[metric];
        const symbol = diff >= 0 ? '✓' : '✗';
        const sign = diff >= 0 ? '+' : '';
        console.log(symbol + ' ' + metric + ': ' + baseline[metric].toFixed(2) + '% → ' + 
                    current[metric].toFixed(2) + '% (' + sign + diff.toFixed(2) + '%)');
        if (diff < 0) decreased = true;
    });
    
    console.log('');
    if (decreased) {
        console.log('⚠️  WARNING: Coverage has decreased from baseline');
        process.exit(1);
    } else {
        console.log('✅ Coverage meets or exceeds baseline');
    }
    "
    
    # Cleanup
    rm -f coverage-current.json coverage-main.json
fi

echo ""
echo "✅ Coverage measurement completed successfully"