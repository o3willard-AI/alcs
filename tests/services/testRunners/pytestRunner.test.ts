/**
 * Unit Tests for Pytest Runner
 */

import { PytestRunner } from '../../../src/services/testRunners/pytestRunner';
import { TestExecutionOptions } from '../../../src/types/mcp';
import * as child_process from 'child_process';
import * as fs from 'fs/promises';

jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('../../../src/services/loggerService');
jest.mock('../../../src/services/coverageParser');

// Import mocked coverageParser
import { coverageParser } from '../../../src/services/coverageParser';

describe('PytestRunner', () => {
  let runner: PytestRunner;
  const mockExecFile = child_process.execFile as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    runner = new PytestRunner();

    // Mock coverageParser
    (coverageParser.parsePytestCoverage as jest.Mock).mockResolvedValue({
      line_coverage: 85.5,
      branch_coverage: 85.5,
      function_coverage: 85.5,
      lines_covered: 85,
      lines_total: 100,
      uncovered_lines: [10, 15],
    });
  });

  describe('execute', () => {
    const workspacePath = '/tmp/test-workspace';
    const codeFilePath = '/tmp/test-workspace/code/calculator.py';
    const testFilePath = '/tmp/test-workspace/tests/test_calculator.py';
    const options: TestExecutionOptions = {
      timeout_seconds: 300,
      memory_limit_mb: 512,
    };

    it('should execute pytest and parse successful results', async () => {
      const mockStdout = `
============================= test session starts ==============================
collected 5 items

test_calculator.py::test_add PASSED                                      [ 20%]
test_calculator.py::test_subtract PASSED                                 [ 40%]
test_calculator.py::test_multiply PASSED                                 [ 60%]
test_calculator.py::test_divide PASSED                                   [ 80%]
test_calculator.py::test_modulo PASSED                                   [100%]

============================== 5 passed in 0.12s ===============================
`;

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(null, { stdout: mockStdout, stderr: '' });
      });

      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(true);
      expect(result.passed_tests).toBe(5);
      expect(result.failed_tests).toBe(0);
      expect(result.total_tests).toBe(5);
      expect(result.coverage_percentage).toBe(85.5);
      expect(result.failures).toHaveLength(0);
    });

    it('should handle test failures', async () => {
      const mockStdout = `
============================= test session starts ==============================
collected 5 items

test_calculator.py::test_add PASSED                                      [ 20%]
test_calculator.py::test_subtract PASSED                                 [ 40%]
test_calculator.py::test_divide FAILED                                   [ 60%]
test_calculator.py::test_modulo PASSED                                   [ 80%]
test_calculator.py::test_invalid FAILED                                  [100%]

=================================== FAILURES ===================================
FAILED test_calculator.py::test_divide - ZeroDivisionError: division by zero
FAILED test_calculator.py::test_invalid - AssertionError: Expected 5, got 4

============================== 3 passed, 2 failed in 0.15s =====================
`;

      const error = new Error('Test failed');
      (error as any).code = 1;
      (error as any).stdout = mockStdout;
      (error as any).stderr = '';

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(error);
      });

      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(false);
      expect(result.passed_tests).toBe(3);
      expect(result.failed_tests).toBe(2);
      expect(result.total_tests).toBe(5);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].test_name).toBe('test_divide');
      expect(result.failures[0].error_message).toContain('ZeroDivisionError');
      expect(result.failures[1].test_name).toBe('test_invalid');
    });

    it('should handle pytest timeout', async () => {
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

    it('should handle missing coverage report', async () => {
      const mockStdout = '3 passed in 0.10s';

      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        callback(null, { stdout: mockStdout, stderr: '' });
      });

      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await runner.execute(workspacePath, codeFilePath, testFilePath, options);

      expect(result.success).toBe(true);
      expect(result.coverage_percentage).toBe(0); // Should use zero coverage
    });

    it('should respect timeout option', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, callback) => {
        expect(opts.timeout).toBe(60000); // 60 seconds
        callback(null, { stdout: '1 passed', stderr: '' });
      });

      (fs.access as jest.Mock).mockResolvedValue(undefined);

      await runner.execute(workspacePath, codeFilePath, testFilePath, {
        timeout_seconds: 60,
      });

      expect(mockExecFile).toHaveBeenCalled();
    });
  });

  // Note: isAvailable tests omitted due to mocking complexity with promisified execFile
  // The method is a simple wrapper and can be tested via integration tests
});
