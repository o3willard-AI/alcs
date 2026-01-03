/**
 * Test Runner Service
 *
 * Orchestrates test execution for generated code using various test frameworks.
 * Manages sandboxed execution, coverage reporting, and failure analysis.
 */

import {
  Artifact,
  TestExecutionResult,
  TestExecutionOptions,
  TestFramework,
  Defect,
} from '../types/mcp';
import { logger } from './loggerService';
import { tempFileManager } from './tempFileManager';
import { metricsService } from './metricsService';

/**
 * Base interface for framework-specific test runners
 */
export interface TestRunner {
  framework: TestFramework;

  /**
   * Execute tests for the given code and test artifacts
   * @param workspacePath Path to temporary workspace
   * @param codeFilePath Path to code file
   * @param testFilePath Path to test file
   * @param options Execution options
   * @returns Test execution result
   */
  execute(
    workspacePath: string,
    codeFilePath: string,
    testFilePath: string,
    options: TestExecutionOptions
  ): Promise<TestExecutionResult>;
}

export class TestRunnerService {
  private runners: Map<TestFramework, TestRunner> = new Map();

  constructor() {
    // Runners will be registered as they are implemented
    logger.info('TestRunnerService initialized');
  }

  /**
   * Register a test runner for a specific framework
   * @param runner Test runner instance
   */
  registerRunner(runner: TestRunner): void {
    this.runners.set(runner.framework, runner);
    logger.info(`Registered test runner for framework: ${runner.framework}`);
  }

  /**
   * Execute tests for code and test artifacts
   * @param codeArtifact Code artifact to test
   * @param testArtifact Test suite artifact
   * @param framework Test framework to use
   * @param options Execution options
   * @returns Test execution result
   */
  async executeTests(
    codeArtifact: Artifact,
    testArtifact: Artifact,
    framework: TestFramework,
    options?: TestExecutionOptions
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();
    const sessionId = codeArtifact.metadata?.session_id || 'unknown';

    logger.info(
      `Executing tests for artifact ${codeArtifact.id} using framework ${framework}`
    );

    // Default options
    const execOptions: TestExecutionOptions = {
      timeout_seconds: options?.timeout_seconds || 300, // 5 minutes default
      memory_limit_mb: options?.memory_limit_mb || 512,
      cpu_limit: options?.cpu_limit || 1.0,
      enable_network: options?.enable_network || false,
    };

    let workspace: string | null = null;

    try {
      // 1. Create temporary workspace
      workspace = await tempFileManager.createTempWorkspace(sessionId);

      // 2. Write code and test artifacts to files
      const codeFilePath = await tempFileManager.writeArtifact(workspace, codeArtifact);
      const testFilePath = await tempFileManager.writeArtifact(workspace, testArtifact);

      // 3. Get the appropriate test runner
      const runner = this.runners.get(framework);
      if (!runner) {
        throw new Error(`No test runner registered for framework: ${framework}`);
      }

      // 4. Execute tests
      const result = await runner.execute(
        workspace,
        codeFilePath,
        testFilePath,
        execOptions
      );

      // 5. Add execution metadata
      result.duration_ms = Date.now() - startTime;

      logger.info(
        `Test execution completed: ${result.passed_tests}/${result.total_tests} passed, ` +
        `${result.coverage_percentage.toFixed(2)}% coverage, ${result.duration_ms}ms`
      );

      // 6. Record test execution metrics
      const language = codeArtifact.metadata?.language || 'unknown';
      metricsService.recordTestExecution(
        framework,
        language,
        result.duration_ms / 1000, // Convert to seconds
        result.coverage_percentage,
        result.success,
        result.success ? undefined : 'test_failed'
      );

      return result;

    } catch (error: any) {
      logger.error(`Test execution failed: ${error.message}`);

      // Record test execution failure metrics
      const language = codeArtifact.metadata?.language || 'unknown';
      const duration = Date.now() - startTime;
      metricsService.recordTestExecution(
        framework,
        language,
        duration / 1000, // Convert to seconds
        0, // No coverage on failure
        false,
        'execution_error'
      );

      // Return failed result instead of throwing
      return {
        success: false,
        passed_tests: 0,
        failed_tests: 0,
        total_tests: 0,
        coverage_percentage: 0,
        duration_ms: Date.now() - startTime,
        failures: [{
          test_name: 'Test Execution',
          error_message: `Test execution failed: ${error.message}`,
          stack_trace: error.stack || '',
          location: 'unknown',
        }],
        stdout: '',
        stderr: error.message,
      };

    } finally {
      // 6. Cleanup workspace
      if (workspace) {
        await tempFileManager.cleanup(workspace);
      }
    }
  }

  /**
   * Convert test failures to defect objects for review system
   * @param result Test execution result
   * @returns Array of defects
   */
  mapFailuresToDefects(result: TestExecutionResult): Defect[] {
    if (result.failures.length === 0) {
      return [];
    }

    return result.failures.map(failure => ({
      severity: 'major' as const, // Failed tests are major defects
      category: 'test_failure',
      location: failure.location,
      description: `Test failed: ${failure.test_name}`,
      suggested_fix: `Fix the issue causing: ${failure.error_message}`,
    }));
  }

  /**
   * Detect test framework from artifact metadata or content
   * @param testArtifact Test artifact
   * @returns Detected framework or undefined
   */
  detectFramework(testArtifact: Artifact): TestFramework | undefined {
    // Check metadata first
    if (testArtifact.metadata?.framework) {
      return testArtifact.metadata.framework as TestFramework;
    }

    // Check content patterns
    const content = testArtifact.content || '';

    // Python frameworks
    if (content.includes('import pytest') || content.includes('def test_')) {
      return 'pytest';
    }

    // JavaScript frameworks
    if (content.includes('describe(') && content.includes('it(')) {
      if (content.includes('jest') || content.includes('@jest')) {
        return 'jest';
      }
      return 'jasmine';
    }

    // Go tests
    if (content.includes('import "testing"') || content.match(/func Test\w+\(t \*testing\.T\)/)) {
      return 'go_testing';
    }

    // Rust tests
    if (content.includes('#[test]') || content.includes('#[cfg(test)]')) {
      return 'rust_test';
    }

    // Java/JUnit
    if (content.includes('@Test') && content.includes('import org.junit')) {
      return 'junit5';
    }

    // C++ Google Test
    if (content.includes('TEST(') || content.includes('TEST_F(')) {
      return 'gtest';
    }

    logger.warn('Unable to detect test framework from artifact content');
    return undefined;
  }

  /**
   * Check if a test runner is available for the given framework
   * @param framework Test framework
   * @returns True if runner is available
   */
  isFrameworkSupported(framework: TestFramework): boolean {
    return this.runners.has(framework);
  }

  /**
   * Get list of supported frameworks
   * @returns Array of supported frameworks
   */
  getSupportedFrameworks(): TestFramework[] {
    return Array.from(this.runners.keys());
  }

  /**
   * Find the test artifact associated with a code artifact
   * @param artifacts List of all artifacts
   * @param codeArtifactId Code artifact ID
   * @returns Test artifact or undefined
   */
  findTestArtifact(artifacts: Artifact[], codeArtifactId: string): Artifact | undefined {
    // Look for test artifact with metadata linking to code artifact
    const byMetadata = artifacts.find(
      a => a.type === 'test_suite' &&
      a.metadata?.code_artifact_id === codeArtifactId
    );
    if (byMetadata) return byMetadata;

    // Look for test artifact created after code artifact
    const codeArtifact = artifacts.find(a => a.id === codeArtifactId);
    if (!codeArtifact) return undefined;

    const testArtifacts = artifacts.filter(
      a => a.type === 'test_suite' && a.timestamp > codeArtifact.timestamp
    );

    // Return the most recent test artifact
    return testArtifacts.sort((a, b) => b.timestamp - a.timestamp)[0];
  }
}

// Export singleton instance
export const testRunnerService = new TestRunnerService();
