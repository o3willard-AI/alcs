/**
 * Pytest Test Runner
 *
 * Executes Python tests using pytest with coverage reporting.
 * Supports pytest, pytest-cov for coverage.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { TestRunner } from '../testRunnerService';
import { TestFramework, TestExecutionResult, TestExecutionOptions, TestFailure } from '../../types/mcp';
import { logger } from '../loggerService';
import { coverageParser } from '../coverageParser';

const execFileAsync = promisify(execFile);

export class PytestRunner implements TestRunner {
  framework: TestFramework = 'pytest';

  async execute(
    workspacePath: string,
    codeFilePath: string,
    testFilePath: string,
    options: TestExecutionOptions
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();

    logger.info(`Executing pytest tests from ${testFilePath}`);

    try {
      // Prepare paths
      const reportsDir = path.join(workspacePath, 'reports');
      const coverageJsonPath = path.join(reportsDir, 'coverage.json');
      const junitXmlPath = path.join(reportsDir, 'junit.xml');

      // Extract module name from code file for coverage
      const codeFileName = path.basename(codeFilePath, '.py');

      // Build pytest command
      const args = [
        testFilePath,
        `--cov=${codeFileName}`,
        '--cov-report=json',
        `--cov-report=json:${coverageJsonPath}`,
        '--junitxml=' + junitXmlPath,
        '-v', // Verbose output
        '--tb=short', // Short traceback format
      ];

      // Execute pytest
      const result = await this.executePytest(workspacePath, args, options);

      // Parse coverage report
      let coverageReport;
      try {
        await fs.access(coverageJsonPath);
        coverageReport = await coverageParser.parsePytestCoverage(coverageJsonPath);
      } catch {
        logger.warn('Coverage report not found, using zero coverage');
        coverageReport = {
          line_coverage: 0,
          branch_coverage: 0,
          function_coverage: 0,
          lines_covered: 0,
          lines_total: 0,
          uncovered_lines: [],
        };
      }

      // Parse test results from stdout
      const testResults = this.parsePytestOutput(result.stdout, result.stderr);

      return {
        success: result.exitCode === 0,
        passed_tests: testResults.passed,
        failed_tests: testResults.failed,
        total_tests: testResults.total,
        coverage_percentage: coverageReport.line_coverage,
        duration_ms: Date.now() - startTime,
        failures: testResults.failures,
        stdout: result.stdout,
        stderr: result.stderr,
      };

    } catch (error: any) {
      logger.error(`Pytest execution failed: ${error.message}`);

      return {
        success: false,
        passed_tests: 0,
        failed_tests: 0,
        total_tests: 0,
        coverage_percentage: 0,
        duration_ms: Date.now() - startTime,
        failures: [{
          test_name: 'pytest_execution',
          error_message: error.message,
          stack_trace: error.stack || '',
          location: 'unknown',
        }],
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
      };
    }
  }

  /**
   * Execute pytest command with timeout
   */
  private async executePytest(
    workspacePath: string,
    args: string[],
    options: TestExecutionOptions
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const timeoutMs = (options.timeout_seconds || 300) * 1000;

    try {
      const { stdout, stderr } = await execFileAsync('pytest', args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          PYTHONPATH: workspacePath,
        },
      });

      return {
        exitCode: 0,
        stdout,
        stderr,
      };

    } catch (error: any) {
      // pytest returns non-zero exit code on test failures, which is expected
      if (error.code === 1 || error.code === 2) {
        // Exit code 1: tests failed
        // Exit code 2: test execution interrupted
        return {
          exitCode: error.code,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
        };
      }

      // Other errors (timeout, command not found, etc.)
      throw error;
    }
  }

  /**
   * Parse pytest output to extract test results
   */
  private parsePytestOutput(stdout: string, stderr: string): {
    passed: number;
    failed: number;
    total: number;
    failures: TestFailure[];
  } {
    const failures: TestFailure[] = [];
    let passed = 0;
    let failed = 0;

    // Parse summary line: "5 passed, 2 failed in 1.23s"
    const summaryMatch = stdout.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1], 10) || 0;
      failed = parseInt(summaryMatch[2], 10) || 0;
    }

    // Parse failed tests
    // Format:
    // FAILED test_file.py::test_name - AssertionError: message
    const failureMatches = stdout.matchAll(/FAILED\s+([\w./]+)::([\w]+)\s+-\s+(.*?)(?=\n|$)/g);

    for (const match of failureMatches) {
      const location = match[1];
      const testName = match[2];
      const errorMessage = match[3];

      // Extract stack trace (if available in verbose output)
      const stackTraceMatch = stdout.match(
        new RegExp(`${testName}[\\s\\S]*?(?=FAILED|===|$)`)
      );

      failures.push({
        test_name: testName,
        error_message: errorMessage,
        stack_trace: stackTraceMatch ? stackTraceMatch[0] : '',
        location: `${location}::${testName}`,
      });
    }

    return {
      passed,
      failed,
      total: passed + failed,
      failures,
    };
  }

  /**
   * Check if pytest is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('pytest', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}
