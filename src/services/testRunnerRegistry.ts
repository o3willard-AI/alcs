/**
 * Test Runner Registry
 *
 * Registers all available test runners with the TestRunnerService.
 * Initializes runners on application startup.
 */

import { testRunnerService } from './testRunnerService';
import { PytestRunner } from './testRunners/pytestRunner';
import { JestRunner } from './testRunners/jestRunner';
import { GoTestRunner } from './testRunners/goTestRunner';
import { JUnitRunner } from './testRunners/junitRunner';
import { MockTestRunner } from './testRunners/mockTestRunner';
import { logger } from './loggerService';

/**
 * Register all test runners
 * Call this on application startup
 */
export async function registerAllTestRunners(): Promise<void> {
  logger.info('Registering test runners...');

  // Register pytest runner
  const pytestRunner = new PytestRunner();
  testRunnerService.registerRunner(pytestRunner);
  logger.info('✓ Registered pytest runner');

  // Register Jest runner
  const jestRunner = new JestRunner();
  testRunnerService.registerRunner(jestRunner);
  logger.info('✓ Registered Jest runner');

  // Register Go test runner
  const goTestRunner = new GoTestRunner();
  testRunnerService.registerRunner(goTestRunner);
  logger.info('✓ Registered Go test runner');

  // Register JUnit runner
  const junitRunner = new JUnitRunner();
  testRunnerService.registerRunner(junitRunner);
  logger.info('✓ Registered JUnit runner');

  // Register mock runner for development/testing
  const mockRunnerPytest = new MockTestRunner('pytest');
  const mockRunnerJest = new MockTestRunner('jest');
  const mockRunnerGo = new MockTestRunner('go_testing');
  const mockRunnerJunit = new MockTestRunner('junit5');

  // Note: Mock runners are not registered by default in production
  // They can be registered manually for testing purposes

  logger.info(`Test runner registration complete. ${testRunnerService.getSupportedFrameworks().length} frameworks supported.`);
}

/**
 * Check availability of test tools
 * Returns a report of which tools are available
 */
export async function checkTestToolAvailability(): Promise<{
  pytest: boolean;
  jest: boolean;
  go: boolean;
  maven: boolean;
  docker: boolean;
}> {
  const pytestRunner = new PytestRunner();
  const jestRunner = new JestRunner();
  const goTestRunner = new GoTestRunner();
  const junitRunner = new JUnitRunner();

  // Import sandboxService dynamically to avoid circular dependency
  const { sandboxService } = await import('./sandboxService.js');

  const [pytest, jest, go, maven, docker] = await Promise.all([
    pytestRunner.isAvailable(),
    jestRunner.isAvailable(),
    goTestRunner.isAvailable(),
    junitRunner.isAvailable(),
    sandboxService.isDockerAvailable(),
  ]);

  return {
    pytest,
    jest,
    go,
    maven,
    docker,
  };
}

/**
 * Log test tool availability report
 */
export async function logTestToolAvailability(): Promise<void> {
  const availability = await checkTestToolAvailability();

  logger.info('Test Tool Availability:');
  logger.info(`  pytest: ${availability.pytest ? '✓ Available' : '✗ Not available'}`);
  logger.info(`  jest: ${availability.jest ? '✓ Available' : '✗ Not available'}`);
  logger.info(`  go: ${availability.go ? '✓ Available' : '✗ Not available'}`);
  logger.info(`  maven: ${availability.maven ? '✓ Available' : '✗ Not available'}`);
  logger.info(`  docker: ${availability.docker ? '✓ Available' : '✗ Not available'}`);

  if (!availability.docker) {
    logger.warn('Docker is not available. Tests will run without sandboxing.');
  }
}
