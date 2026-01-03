/**
 * Unit Tests for Jest Runner
 */

import { JestRunner } from '../../../src/services/testRunners/jestRunner';
import { TestExecutionOptions } from '../../../src/types/mcp';
import * as child_process from 'child_process';

jest.mock('child_process');
jest.mock('../../../src/services/loggerService');
jest.mock('../../../src/services/coverageParser');

// Import mocked coverageParser
import { coverageParser } from '../../../src/services/coverageParser';

describe('JestRunner', () => {
  let runner: JestRunner;
  const mockExecFile = child_process.execFile as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    runner = new JestRunner();

    // Mock coverageParser
    (coverageParser.parseJestCoverage as jest.Mock).mockReturnValue({
      line_coverage: 90.5,
      branch_coverage: 85.0,
      function_coverage: 88.0,
      lines_covered: 90,
      lines_total: 100,
      uncovered_lines: [10, 15],
    });
  });

  describe('execute', () => {
    const workspacePath = '/tmp/test-workspace';
    const codeFilePath = '/tmp/test-workspace/code/calculator.js';
    const testFilePath = '/tmp/test-workspace/tests/calculator.test.js';
    const options: TestExecutionOptions = {
      timeout_seconds: 300,
      memory_limit_mb: 512,
    };

    it('should execute Jest and parse successful results', async () => {
      const mockJestOutput = {
        success: true,
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [
          {
            name: 'calculator.test.js',
            assertionResults: [
              { status: 'passed', fullName: 'Calculator add', title: 'add' },
              { status: 'passed', fullName: 'Calculator subtract', title: 'subtract' },
              { status: 'passed', fullName: 'Calculator multiply', title: 'multiply' },
              { status: 'passed', fullName: 'Calculator divide', title: 'divide' },
              { status: 'passed', fullName: 'Calculator modulo', title: 'modulo' },
            ],
          },
        ],
        coverageMap: {
          'calculator.js': {
            lines: { total: 100, covered: 90 },
            branches: { total: 50, covered: 45 },
            functions: { total: 20, covered: 18 },
          },
        },
      };

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(null, { stdout: JSON.stringify(mockJestOutput), stderr: '' });
      });

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(true);
      expect(result.passed_tests).toBe(5);
      expect(result.failed_tests).toBe(0);
      expect(result.total_tests).toBe(5);
      expect(result.coverage_percentage).toBe(90.5);
      expect(result.failures).toHaveLength(0);
    });

    it('should handle test failures', async () => {
      const mockJestOutput = {
        success: false,
        numTotalTests: 5,
        numPassedTests: 3,
        numFailedTests: 2,
        testResults: [
          {
            name: 'calculator.test.js',
            assertionResults: [
              { status: 'passed', fullName: 'Calculator add', title: 'add' },
              {
                status: 'failed',
                fullName: 'Calculator divide',
                title: 'divide',
                failureMessages: ['Error: Division by zero\n  at divide (calculator.js:20:5)'],
                location: { line: 15 },
              },
              { status: 'passed', fullName: 'Calculator subtract', title: 'subtract' },
              {
                status: 'failed',
                fullName: 'Calculator invalid',
                title: 'invalid',
                failureMessages: ['Expected 5, received 4'],
                location: { line: 30 },
              },
              { status: 'passed', fullName: 'Calculator multiply', title: 'multiply' },
            ],
          },
        ],
        coverageMap: {
          'calculator.js': {
            lines: { total: 100, covered: 75 },
            branches: { total: 50, covered: 40 },
            functions: { total: 20, covered: 16 },
          },
        },
      };

      const error = new Error('Tests failed');
      (error as any).code = 1;
      (error as any).stdout = JSON.stringify(mockJestOutput);
      (error as any).stderr = '';

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(error);
      });

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(false);
      expect(result.passed_tests).toBe(3);
      expect(result.failed_tests).toBe(2);
      expect(result.total_tests).toBe(5);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].test_name).toBe('Calculator divide');
      expect(result.failures[0].error_message).toContain('Division by zero');
      expect(result.failures[1].test_name).toBe('Calculator invalid');
    });

    it('should handle Jest timeout', async () => {
      const error = new Error('Command timeout');
      (error as any).code = 'ETIMEDOUT';

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(error);
      });

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].error_message).toContain('timeout');
    });

    it('should parse non-JSON output as fallback', async () => {
      const mockConsoleOutput = `
 PASS  tests/calculator.test.js
  Calculator
    ✓ add (2 ms)
    ✓ subtract (1 ms)
    ✕ divide (3 ms)
    ✓ multiply (1 ms)

  ● Calculator › divide

    Division by zero

      15 |   it('divides two numbers', () => {
    > 16 |     expect(calculator.divide(10, 0)).toBe(5);
         |                      ^
      17 |   });

Tests: 1 failed, 3 passed, 4 total
`;

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(null, { stdout: mockConsoleOutput, stderr: '' });
      });

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.passed_tests).toBe(3);
      expect(result.failed_tests).toBe(1);
      expect(result.total_tests).toBe(4);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it('should handle missing coverage data', async () => {
      const mockJestOutput = {
        success: true,
        numTotalTests: 3,
        numPassedTests: 3,
        numFailedTests: 0,
        testResults: [],
        // No coverageMap
      };

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(null, { stdout: JSON.stringify(mockJestOutput), stderr: '' });
      });

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(true);
      // Without coverageMap, coverage should be 0 since parser returns zero coverage for null/undefined
      expect(result.coverage_percentage).toBe(0);
    });

    it('should respect timeout option', async () => {
      const mockJestOutput = {
        success: true,
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        testResults: [],
      };

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        expect(opts.timeout).toBe(60000); // 60 seconds
        callback(null, { stdout: JSON.stringify(mockJestOutput), stderr: '' });
      });

      await runner.execute(workspacePath, codeFilePath, testFilePath, {
        timeout_seconds: 60,
      });

      expect(mockExecFile).toHaveBeenCalled();
    });
  });

  // Note: isAvailable tests omitted due to mocking complexity with promisified execFile
  // The method is a simple wrapper and can be tested via integration tests
});
