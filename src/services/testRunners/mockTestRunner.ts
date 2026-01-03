/**
 * Mock Test Runner
 *
 * Simplified test runner for development and testing.
 * Simulates test execution without actually running tests.
 * Used for unit tests and when real test frameworks are not available.
 */

import { TestRunner } from '../testRunnerService';
import { TestFramework, TestExecutionResult, TestExecutionOptions } from '../../types/mcp';
import { logger } from '../loggerService';
import { tempFileManager } from '../tempFileManager';

export class MockTestRunner implements TestRunner {
  framework: TestFramework;
  private mockResult: Partial<TestExecutionResult> | null = null;

  constructor(framework: TestFramework = 'pytest') {
    this.framework = framework;
  }

  /**
   * Set mock result for testing
   * @param result Partial result to return
   */
  setMockResult(result: Partial<TestExecutionResult>): void {
    this.mockResult = result;
  }

  async execute(
    workspacePath: string,
    codeFilePath: string,
    testFilePath: string,
    options: TestExecutionOptions
  ): Promise<TestExecutionResult> {
    logger.debug(`MockTestRunner executing with framework ${this.framework}`);

    // If mock result is set, use it
    if (this.mockResult) {
      return {
        success: true,
        passed_tests: 0,
        failed_tests: 0,
        total_tests: 0,
        coverage_percentage: 0,
        duration_ms: 100,
        failures: [],
        stdout: '',
        stderr: '',
        ...this.mockResult,
      };
    }

    // Read test file to count tests
    const testContent = await tempFileManager.readFile(testFilePath);
    const testCount = this.countTests(testContent);

    // Simulate successful test execution
    return {
      success: true,
      passed_tests: testCount,
      failed_tests: 0,
      total_tests: testCount,
      coverage_percentage: 85.5, // Mock coverage
      duration_ms: 150,
      failures: [],
      stdout: `Ran ${testCount} tests successfully`,
      stderr: '',
    };
  }

  /**
   * Count test functions in test content
   * @param content Test file content
   * @returns Number of tests
   */
  private countTests(content: string): number {
    let count = 0;

    // Python pytest
    if (this.framework === 'pytest') {
      count = (content.match(/def test_\w+/g) || []).length;
    }

    // JavaScript/TypeScript (Jest, Jasmine)
    else if (this.framework === 'jest' || this.framework === 'jasmine') {
      count = (content.match(/it\(/g) || []).length;
    }

    // Go testing
    else if (this.framework === 'go_testing') {
      count = (content.match(/func Test\w+/g) || []).length;
    }

    // Rust tests
    else if (this.framework === 'rust_test') {
      count = (content.match(/#\[test\]/g) || []).length;
    }

    // JUnit
    else if (this.framework === 'junit5') {
      count = (content.match(/@Test/g) || []).length;
    }

    // Google Test (C++)
    else if (this.framework === 'gtest') {
      count = (content.match(/TEST\(/g) || []).length;
    }

    return count || 1; // At least 1 test
  }
}
