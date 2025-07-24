#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Script to measure test coverage and compare with baseline
 * Addresses BUG-095: Test Coverage Cannot Be Measured
 */

const COVERAGE_DIR = path.join(__dirname, '..', 'coverage');
const COVERAGE_SUMMARY = path.join(COVERAGE_DIR, 'coverage-summary.json');

function runCoverageReport(testPattern) {
  console.log(
    `Running coverage report${testPattern ? ` for pattern: ${testPattern}` : ''}...`
  );

  try {
    // Run tests with coverage, ignoring thresholds and exit codes
    execSync(
      `npm test -- --coverage --coverageThreshold='{}' ${testPattern ? `--testPathPattern=${testPattern}` : ''} --json --outputFile=coverage/test-results.json`,
      {
        stdio: 'pipe',
        encoding: 'utf8',
      }
    );
  } catch (error) {
    // Tests may fail, but we still get coverage data
    console.log(
      'Tests completed (some may have failed), checking coverage data...'
    );
  }

  // Check if coverage summary was generated
  if (!fs.existsSync(COVERAGE_SUMMARY)) {
    console.error('ERROR: Coverage summary not generated');
    return null;
  }

  // Read and parse coverage summary
  const summary = JSON.parse(fs.readFileSync(COVERAGE_SUMMARY, 'utf8'));
  return summary;
}

function formatCoverageMetrics(summary) {
  if (!summary || !summary.total) {
    return null;
  }

  const total = summary.total;
  return {
    lines: {
      percentage: total.lines.pct,
      covered: total.lines.covered,
      total: total.lines.total,
    },
    statements: {
      percentage: total.statements.pct,
      covered: total.statements.covered,
      total: total.statements.total,
    },
    functions: {
      percentage: total.functions.pct,
      covered: total.functions.covered,
      total: total.functions.total,
    },
    branches: {
      percentage: total.branches.pct,
      covered: total.branches.covered,
      total: total.branches.total,
    },
  };
}

function displayCoverageReport(metrics, label) {
  if (!metrics) {
    console.log(`\n${label}: No coverage data available`);
    return;
  }

  console.log(`\n${label}:`);
  console.log('═'.repeat(50));
  console.log(
    `Lines:      ${metrics.lines.percentage.toFixed(2)}% (${metrics.lines.covered}/${metrics.lines.total})`
  );
  console.log(
    `Statements: ${metrics.statements.percentage.toFixed(2)}% (${metrics.statements.covered}/${metrics.statements.total})`
  );
  console.log(
    `Functions:  ${metrics.functions.percentage.toFixed(2)}% (${metrics.functions.covered}/${metrics.functions.total})`
  );
  console.log(
    `Branches:   ${metrics.branches.percentage.toFixed(2)}% (${metrics.branches.covered}/${metrics.branches.total})`
  );
}

function compareCoverage(baseline, current) {
  if (!baseline || !current) {
    return { canCompare: false };
  }

  const comparison = {
    canCompare: true,
    decreased: false,
    metrics: {},
  };

  ['lines', 'statements', 'functions', 'branches'].forEach(metric => {
    const diff = current[metric].percentage - baseline[metric].percentage;
    comparison.metrics[metric] = {
      baseline: baseline[metric].percentage,
      current: current[metric].percentage,
      diff: diff,
      decreased: diff < 0,
    };
    if (diff < 0) {
      comparison.decreased = true;
    }
  });

  return comparison;
}

function main() {
  const args = process.argv.slice(2);
  const testPattern = args
    .find(arg => arg.startsWith('--pattern='))
    ?.split('=')[1];
  const saveBaseline = args.includes('--save-baseline');
  const compareBaseline = args.includes('--compare-baseline');

  console.log('BUG-095 Fix: Test Coverage Measurement Tool');
  console.log('='.repeat(50));

  // Run coverage report
  const summary = runCoverageReport(testPattern);
  const metrics = formatCoverageMetrics(summary);

  if (!metrics) {
    console.error('\nERROR: Failed to measure coverage');
    process.exit(1);
  }

  displayCoverageReport(metrics, 'Current Coverage');

  // Save baseline if requested
  if (saveBaseline) {
    const baselineFile = path.join(__dirname, '..', 'coverage-baseline.json');
    fs.writeFileSync(baselineFile, JSON.stringify(metrics, null, 2));
    console.log(`\nBaseline saved to: ${baselineFile}`);
  }

  // Compare with baseline if requested
  if (compareBaseline) {
    const baselineFile = path.join(__dirname, '..', 'coverage-baseline.json');
    if (fs.existsSync(baselineFile)) {
      const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
      displayCoverageReport(baseline, 'Baseline Coverage');

      const comparison = compareCoverage(baseline, metrics);
      if (comparison.canCompare) {
        console.log('\nCoverage Comparison:');
        console.log('═'.repeat(50));
        Object.entries(comparison.metrics).forEach(([metric, data]) => {
          const symbol = data.diff >= 0 ? '✓' : '✗';
          const sign = data.diff >= 0 ? '+' : '';
          console.log(
            `${symbol} ${metric}: ${data.baseline.toFixed(2)}% → ${data.current.toFixed(2)}% (${sign}${data.diff.toFixed(2)}%)`
          );
        });

        if (comparison.decreased) {
          console.log('\n⚠️  WARNING: Coverage has decreased from baseline');
        } else {
          console.log('\n✅ Coverage meets or exceeds baseline');
        }
      }
    } else {
      console.log(
        '\nNo baseline found. Run with --save-baseline to create one.'
      );
    }
  }

  // Test results summary
  if (fs.existsSync(path.join(COVERAGE_DIR, 'test-results.json'))) {
    const testResults = JSON.parse(
      fs.readFileSync(path.join(COVERAGE_DIR, 'test-results.json'), 'utf8')
    );
    console.log('\nTest Results:');
    console.log('═'.repeat(50));
    console.log(`Total Tests: ${testResults.numTotalTests}`);
    console.log(`Passed: ${testResults.numPassedTests}`);
    console.log(`Failed: ${testResults.numFailedTests}`);
    console.log(
      `Success Rate: ${((testResults.numPassedTests / testResults.numTotalTests) * 100).toFixed(2)}%`
    );
  }

  console.log('\n✅ Coverage measurement completed successfully');
}

// Run the script
main();
