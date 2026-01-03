/**
 * Unit Tests for Test Runner Service
 */

import { TestRunnerService, TestRunner } from '../../src/services/testRunnerService';
import { MockTestRunner } from '../../src/services/testRunners/mockTestRunner';
import { Artifact, TestFramework, TestExecutionResult } from '../../src/types/mcp';
import { tempFileManager } from '../../src/services/tempFileManager';

// Mock the tempFileManager
jest.mock('../../src/services/tempFileManager');
jest.mock('../../src/services/loggerService');

describe('TestRunnerService', () => {
  let service: TestRunnerService;
  let mockRunner: MockTestRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TestRunnerService();
    mockRunner = new MockTestRunner('pytest');
    service.registerRunner(mockRunner);
  });

  describe('registerRunner', () => {
    it('should register a test runner', () => {
      const jestRunner = new MockTestRunner('jest');
      service.registerRunner(jestRunner);

      expect(service.isFrameworkSupported('jest')).toBe(true);
    });

    it('should list supported frameworks', () => {
      const jestRunner = new MockTestRunner('jest');
      service.registerRunner(jestRunner);

      const frameworks = service.getSupportedFrameworks();
      expect(frameworks).toContain('pytest');
      expect(frameworks).toContain('jest');
    });
  });

  describe('executeTests', () => {
    const codeArtifact: Artifact = {
      id: 'code-1',
      type: 'code',
      description: 'Sample code',
      timestamp: Date.now(),
      content: 'def add(a, b): return a + b',
      metadata: { language: 'python', session_id: 'test-session' },
    };

    const testArtifact: Artifact = {
      id: 'test-1',
      type: 'test_suite',
      description: 'Sample tests',
      timestamp: Date.now(),
      content: 'def test_add(): assert add(1, 2) == 3',
      metadata: { framework: 'pytest', code_artifact_id: 'code-1' },
    };

    beforeEach(() => {
      // Mock tempFileManager methods
      (tempFileManager.createTempWorkspace as jest.Mock).mockResolvedValue('/tmp/test-workspace');
      (tempFileManager.writeArtifact as jest.Mock)
        .mockResolvedValueOnce('/tmp/test-workspace/code/main.py')
        .mockResolvedValueOnce('/tmp/test-workspace/tests/test_main.py');
      (tempFileManager.cleanup as jest.Mock).mockResolvedValue(undefined);
    });

    it('should execute tests successfully', async () => {
      mockRunner.setMockResult({
        success: true,
        passed_tests: 5,
        failed_tests: 0,
        total_tests: 5,
        coverage_percentage: 90,
      });

      const result = await service.executeTests(codeArtifact, testArtifact, 'pytest');

      expect(result.success).toBe(true);
      expect(result.passed_tests).toBe(5);
      expect(result.total_tests).toBe(5);
      expect(result.coverage_percentage).toBe(90);
    });

    it('should handle test execution errors gracefully', async () => {
      // Mock runner to throw error
      mockRunner.setMockResult = jest.fn().mockImplementation(() => {
        throw new Error('Test execution failed');
      });

      // Temporarily replace the execute method to throw
      const originalExecute = mockRunner.execute;
      mockRunner.execute = jest.fn().mockRejectedValue(new Error('Test execution failed'));

      const result = await service.executeTests(codeArtifact, testArtifact, 'pytest');

      expect(result.success).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.stderr).toContain('Test execution failed');

      // Restore original method
      mockRunner.execute = originalExecute;
    });

    it('should cleanup workspace after execution', async () => {
      await service.executeTests(codeArtifact, testArtifact, 'pytest');

      expect(tempFileManager.cleanup).toHaveBeenCalledWith('/tmp/test-workspace');
    });

    it('should cleanup workspace even if execution fails', async () => {
      mockRunner.execute = jest.fn().mockRejectedValue(new Error('Test failed'));

      await service.executeTests(codeArtifact, testArtifact, 'pytest');

      expect(tempFileManager.cleanup).toHaveBeenCalledWith('/tmp/test-workspace');
    });

    it('should throw error for unsupported framework', async () => {
      const result = await service.executeTests(
        codeArtifact,
        testArtifact,
        'unsupported_framework' as TestFramework
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('No test runner registered');
    });

    it('should apply default execution options', async () => {
      const executeSpy = jest.spyOn(mockRunner, 'execute');

      await service.executeTests(codeArtifact, testArtifact, 'pytest');

      expect(executeSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          timeout_seconds: 300,
          memory_limit_mb: 512,
          cpu_limit: 1.0,
          enable_network: false,
        })
      );
    });

    it('should override default options when provided', async () => {
      const executeSpy = jest.spyOn(mockRunner, 'execute');

      await service.executeTests(codeArtifact, testArtifact, 'pytest', {
        timeout_seconds: 60,
        memory_limit_mb: 256,
      });

      expect(executeSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          timeout_seconds: 60,
          memory_limit_mb: 256,
        })
      );
    });
  });

  describe('mapFailuresToDefects', () => {
    it('should convert test failures to defects', () => {
      const result: TestExecutionResult = {
        success: false,
        passed_tests: 3,
        failed_tests: 2,
        total_tests: 5,
        coverage_percentage: 75,
        duration_ms: 1000,
        failures: [
          {
            test_name: 'test_addition',
            error_message: 'Expected 5, got 4',
            stack_trace: 'at test_addition (test.py:10)',
            location: 'test.py:10',
          },
          {
            test_name: 'test_multiplication',
            error_message: 'Expected 20, got 15',
            stack_trace: 'at test_multiplication (test.py:15)',
            location: 'test.py:15',
          },
        ],
        stdout: '',
        stderr: '',
      };

      const defects = service.mapFailuresToDefects(result);

      expect(defects).toHaveLength(2);
      expect(defects[0].severity).toBe('major');
      expect(defects[0].category).toBe('test_failure');
      expect(defects[0].description).toContain('test_addition');
      expect(defects[1].description).toContain('test_multiplication');
    });

    it('should return empty array for successful tests', () => {
      const result: TestExecutionResult = {
        success: true,
        passed_tests: 5,
        failed_tests: 0,
        total_tests: 5,
        coverage_percentage: 95,
        duration_ms: 800,
        failures: [],
        stdout: '',
        stderr: '',
      };

      const defects = service.mapFailuresToDefects(result);

      expect(defects).toHaveLength(0);
    });
  });

  describe('detectFramework', () => {
    it('should detect pytest from metadata', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: '',
        metadata: { framework: 'pytest' },
      };

      expect(service.detectFramework(artifact)).toBe('pytest');
    });

    it('should detect pytest from content', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: 'import pytest\ndef test_something():\n    pass',
      };

      expect(service.detectFramework(artifact)).toBe('pytest');
    });

    it('should detect jest from content', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: 'describe("test", () => {\n  it("works", () => {});\n});',
      };

      expect(service.detectFramework(artifact)).toBe('jasmine');
    });

    it('should detect go_testing from content', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: 'import "testing"\nfunc TestSomething(t *testing.T) {}',
      };

      expect(service.detectFramework(artifact)).toBe('go_testing');
    });

    it('should detect rust_test from content', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: '#[test]\nfn test_something() {}',
      };

      expect(service.detectFramework(artifact)).toBe('rust_test');
    });

    it('should detect junit5 from content', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: 'import org.junit.jupiter.api.Test;\n@Test\nvoid testSomething() {}',
      };

      expect(service.detectFramework(artifact)).toBe('junit5');
    });

    it('should return undefined for unknown framework', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        content: 'unknown test content',
      };

      expect(service.detectFramework(artifact)).toBeUndefined();
    });
  });

  describe('findTestArtifact', () => {
    const artifacts: Artifact[] = [
      {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: 1000,
      },
      {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test for code-1',
        timestamp: 2000,
        metadata: { code_artifact_id: 'code-1' },
      },
      {
        id: 'code-2',
        type: 'code',
        description: 'Code 2',
        timestamp: 3000,
      },
      {
        id: 'test-2',
        type: 'test_suite',
        description: 'Test',
        timestamp: 4000,
      },
    ];

    it('should find test artifact by metadata', () => {
      const testArtifact = service.findTestArtifact(artifacts, 'code-1');

      expect(testArtifact).toBeDefined();
      expect(testArtifact?.id).toBe('test-1');
    });

    it('should find most recent test artifact after code', () => {
      const testArtifact = service.findTestArtifact(artifacts, 'code-2');

      expect(testArtifact).toBeDefined();
      expect(testArtifact?.id).toBe('test-2');
    });

    it('should return undefined if no test artifact found', () => {
      const noTestArtifacts: Artifact[] = [
        {
          id: 'code-1',
          type: 'code',
          description: 'Code',
          timestamp: 1000,
        },
      ];

      const testArtifact = service.findTestArtifact(noTestArtifacts, 'code-1');

      expect(testArtifact).toBeUndefined();
    });

    it('should return undefined if code artifact not found', () => {
      const testArtifact = service.findTestArtifact(artifacts, 'non-existent');

      expect(testArtifact).toBeUndefined();
    });
  });
});
