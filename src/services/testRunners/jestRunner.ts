/**
 * Jest Test Runner
 *
 * Executes JavaScript/TypeScript tests using Jest with coverage reporting.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { TestRunner } from '../testRunnerService';
import { TestFramework, TestExecutionResult, TestExecutionOptions, TestFailure } from '../../types/mcp';
import { logger } from '../loggerService';
import { coverageParser } from '../coverageParser';

const execFileAsync = promisify(execFile);

export class JestRunner implements TestRunner {
  framework: TestFramework = 'jest';

  async execute(
    workspacePath: string,
    codeFilePath: string,
    testFilePath: string,
    options: TestExecutionOptions
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();

    logger.info(`Executing Jest tests from ${testFilePath}`);

    try {
      // Build jest command
      const args = [
        '--coverage',
        '--json',
        '--testPathPattern=' + path.basename(testFilePath),
        '--collectCoverageFrom=' + path.basename(codeFilePath),
        '--coverageDirectory=' + path.join(workspacePath, 'reports'),
        '--no-cache',
        '--silent', // Suppress console.log output from tests
      ];

      // Execute jest
      const result = await this.executeJest(workspacePath, args, options);

      // Parse JSON output
      const testResults = this.parseJestOutput(result.stdout);

      // Extract coverage from JSON
      const coverage = testResults.coverageMap
        ? coverageParser.parseJestCoverage(testResults.coverageMap)
        : {
            line_coverage: 0,
            branch_coverage: 0,
            function_coverage: 0,
            lines_covered: 0,
            lines_total: 0,
            uncovered_lines: [],
          };

      return {
        success: testResults.success,
        passed_tests: testResults.numPassedTests,
        failed_tests: testResults.numFailedTests,
        total_tests: testResults.numTotalTests,
        coverage_percentage: coverage.line_coverage,
        duration_ms: Date.now() - startTime,
        failures: testResults.failures,
        stdout: result.stdout,
        stderr: result.stderr,
      };

    } catch (error: any) {
      logger.error(`Jest execution failed: ${error.message}`);

      return {
        success: false,
        passed_tests: 0,
        failed_tests: 0,
        total_tests: 0,
        coverage_percentage: 0,
        duration_ms: Date.now() - startTime,
        failures: [{
          test_name: 'jest_execution',
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
   * Execute jest command with timeout
   */
  private async executeJest(
    workspacePath: string,
    args: string[],
    options: TestExecutionOptions
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const timeoutMs = (options.timeout_seconds || 300) * 1000;

    // Find jest binary (might be in node_modules/.bin or globally installed)
    const jestCommand = 'npx'; // Use npx to find jest
    const jestArgs = ['jest', ...args];

    try {
      const { stdout, stderr } = await execFileAsync(jestCommand, jestArgs, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
      });

      return {
        exitCode: 0,
        stdout,
        stderr,
      };

    } catch (error: any) {
      // Jest returns non-zero exit code on test failures, which is expected
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
   * Parse Jest JSON output
   */
  private parseJestOutput(stdout: string): {
    success: boolean;
    numTotalTests: number;
    numPassedTests: number;
    numFailedTests: number;
    failures: TestFailure[];
    coverageMap?: any;
  } {
    try {
      const result = JSON.parse(stdout);

      const failures: TestFailure[] = [];

      // Extract test failures
      if (result.testResults) {
        for (const testFile of result.testResults) {
          if (testFile.assertionResults) {
            for (const assertion of testFile.assertionResults) {
              if (assertion.status === 'failed') {
                failures.push({
                  test_name: assertion.fullName || assertion.title,
                  error_message: this.extractErrorMessage(assertion),
                  stack_trace: this.extractStackTrace(assertion),
                  location: `${testFile.name}:${assertion.location?.line || 0}`,
                });
              }
            }
          }
        }
      }

      return {
        success: result.success || false,
        numTotalTests: result.numTotalTests || 0,
        numPassedTests: result.numPassedTests || 0,
        numFailedTests: result.numFailedTests || 0,
        failures,
        coverageMap: result.coverageMap,
      };

    } catch (error: any) {
      logger.error(`Failed to parse Jest output: ${error.message}`);

      // Try to extract basic info from non-JSON output
      return this.parseNonJsonOutput(stdout);
    }
  }

  /**
   * Extract error message from Jest assertion result
   */
  private extractErrorMessage(assertion: any): string {
    if (assertion.failureMessages && assertion.failureMessages.length > 0) {
      // Get first line of error message
      const fullMessage = assertion.failureMessages[0];
      const lines = fullMessage.split('\n');
      return lines[0] || 'Test failed';
    }

    return 'Test failed';
  }

  /**
   * Extract stack trace from Jest assertion result
   */
  private extractStackTrace(assertion: any): string {
    if (assertion.failureMessages && assertion.failureMessages.length > 0) {
      return assertion.failureMessages.join('\n\n');
    }

    return '';
  }

  /**
   * Parse non-JSON Jest output (fallback)
   */
  private parseNonJsonOutput(stdout: string): {
    success: boolean;
    numTotalTests: number;
    numPassedTests: number;
    numFailedTests: number;
    failures: TestFailure[];
  } {
    let passed = 0;
    let failed = 0;

    // Try to extract from summary line
    // Format: "Tests: 2 failed, 3 passed, 5 total"
    const summaryMatch = stdout.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/);
    if (summaryMatch) {
      failed = parseInt(summaryMatch[1], 10) || 0;
      passed = parseInt(summaryMatch[2], 10) || 0;
    }

    // Parse failures from console output
    const failures: TestFailure[] = [];
    const failureMatches = stdout.matchAll(/●\s+(.*?)(?=\n\n|●|$)/gs);

    for (const match of failureMatches) {
      const failureText = match[1];
      const lines = failureText.split('\n');
      const testName = lines[0]?.trim() || 'Unknown test';

      failures.push({
        test_name: testName,
        error_message: lines[1]?.trim() || 'Test failed',
        stack_trace: failureText,
        location: 'unknown',
      });
    }

    return {
      success: failed === 0,
      numTotalTests: passed + failed,
      numPassedTests: passed,
      numFailedTests: failed,
      failures,
    };
  }

  /**
   * Check if jest is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('npx', ['jest', '--version']);
      return true;
    } catch {
      return false;
    }
  }
}
