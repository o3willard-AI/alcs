/**
 * Go Test Runner
 *
 * Executes Go tests using the go test command with coverage reporting.
 * Supports Go's built-in testing package.
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

export class GoTestRunner implements TestRunner {
  framework: TestFramework = 'go_testing';

  async execute(
    workspacePath: string,
    codeFilePath: string,
    testFilePath: string,
    options: TestExecutionOptions
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();

    logger.info(`Executing Go tests from ${testFilePath}`);

    try {
      // Prepare paths
      const reportsDir = path.join(workspacePath, 'reports');
      const coverageProfilePath = path.join(reportsDir, 'coverage.out');

      // Build go test command
      // Go requires tests to be in the same package, so we run from workspace
      const args = [
        'test',
        '-v', // Verbose output
        '-json', // JSON output for parsing
        '-cover', // Enable coverage
        '-coverprofile=' + coverageProfilePath,
        './...', // Test all packages in workspace
      ];

      // Execute go test
      const result = await this.executeGoTest(workspacePath, args, options);

      // Parse coverage report
      let coverageReport;
      try {
        await fs.access(coverageProfilePath);
        coverageReport = await coverageParser.parseGoCoverageProfile(coverageProfilePath);
      } catch {
        // Try parsing from stdout if profile not available
        logger.warn('Coverage profile not found, parsing from stdout');
        coverageReport = await coverageParser.parseGoCoverage(result.stdout);
      }

      // Parse test results from JSON output
      const testResults = this.parseGoTestOutput(result.stdout);

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
      logger.error(`Go test execution failed: ${error.message}`);

      return {
        success: false,
        passed_tests: 0,
        failed_tests: 0,
        total_tests: 0,
        coverage_percentage: 0,
        duration_ms: Date.now() - startTime,
        failures: [{
          test_name: 'go_test_execution',
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
   * Execute go test command with timeout
   */
  private async executeGoTest(
    workspacePath: string,
    args: string[],
    options: TestExecutionOptions
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const timeoutMs = (options.timeout_seconds || 300) * 1000;

    try {
      const { stdout, stderr } = await execFileAsync('go', args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          GOPATH: process.env.GOPATH || path.join(process.env.HOME || '~', 'go'),
        },
      });

      return {
        exitCode: 0,
        stdout,
        stderr,
      };

    } catch (error: any) {
      // go test returns non-zero exit code on test failures, which is expected
      if (error.code === 1) {
        // Exit code 1: tests failed
        return {
          exitCode: 1,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
        };
      }

      // Other errors (timeout, command not found, etc.)
      throw error;
    }
  }

  /**
   * Parse Go test JSON output
   * Format: One JSON object per line
   * {"Time":"2024-01-01T12:00:00Z","Action":"run","Package":"example","Test":"TestAdd"}
   * {"Time":"2024-01-01T12:00:00Z","Action":"pass","Package":"example","Test":"TestAdd","Elapsed":0.01}
   */
  private parseGoTestOutput(stdout: string): {
    passed: number;
    failed: number;
    total: number;
    failures: TestFailure[];
  } {
    const failures: TestFailure[] = [];
    let passed = 0;
    let failed = 0;
    const testResults = new Map<string, { action: string; output?: string }>();

    // Parse JSON lines
    const lines = stdout.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const event = JSON.parse(line);

        // Track test events
        if (event.Test && event.Action) {
          const testName = event.Test;

          if (event.Action === 'pass') {
            testResults.set(testName, { action: 'pass' });
          } else if (event.Action === 'fail') {
            testResults.set(testName, { action: 'fail', output: event.Output || '' });
          } else if (event.Action === 'output' && event.Output) {
            // Accumulate output for failed tests
            const existing = testResults.get(testName);
            if (existing) {
              existing.output = (existing.output || '') + event.Output;
            } else {
              testResults.set(testName, { action: 'output', output: event.Output });
            }
          }
        }
      } catch {
        // Skip non-JSON lines (coverage summary, etc.)
        continue;
      }
    }

    // Count results and extract failures
    for (const [testName, result] of testResults.entries()) {
      if (result.action === 'pass') {
        passed++;
      } else if (result.action === 'fail') {
        failed++;

        // Extract error message from output
        const output = result.output || '';
        const errorMatch = output.match(/Error:\s*(.*?)(?=\n|$)/);
        const errorMessage = errorMatch ? errorMatch[1] : 'Test failed';

        failures.push({
          test_name: testName,
          error_message: errorMessage,
          stack_trace: output,
          location: this.extractLocation(output),
        });
      }
    }

    // Fallback: parse non-JSON output if no JSON events found
    if (passed === 0 && failed === 0) {
      return this.parseNonJsonOutput(stdout);
    }

    return {
      passed,
      failed,
      total: passed + failed,
      failures,
    };
  }

  /**
   * Extract file location from Go test output
   */
  private extractLocation(output: string): string {
    // Look for file:line pattern
    const match = output.match(/(\w+_test\.go):(\d+)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }

    return 'unknown';
  }

  /**
   * Parse non-JSON Go test output (fallback)
   */
  private parseNonJsonOutput(stdout: string): {
    passed: number;
    failed: number;
    total: number;
    failures: TestFailure[];
  } {
    let passed = 0;
    let failed = 0;
    const failures: TestFailure[] = [];

    // Parse summary line: "PASS" or "FAIL"
    // Count test functions
    const passMatches = stdout.matchAll(/--- PASS:\s+(Test\w+)/g);
    const failMatches = stdout.matchAll(/--- FAIL:\s+(Test\w+)/g);

    for (const match of passMatches) {
      passed++;
    }

    for (const match of failMatches) {
      failed++;
      const testName = match[1];

      // Try to extract error message
      const errorPattern = new RegExp(`--- FAIL: ${testName}[\\s\\S]*?Error:\\s*(.*?)(?=\\n|$)`);
      const errorMatch = stdout.match(errorPattern);

      failures.push({
        test_name: testName,
        error_message: errorMatch ? errorMatch[1] : 'Test failed',
        stack_trace: '',
        location: 'unknown',
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
   * Check if go is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('go', ['version']);
      return true;
    } catch {
      return false;
    }
  }
}
