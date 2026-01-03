/**
 * Static Analysis Registry
 *
 * Registers all available static analyzers with the StaticAnalysisService.
 * Initializes analyzers on application startup.
 */

import { staticAnalysisService } from './staticAnalysisService';
import { ESLintAnalyzer } from './analyzers/eslintAnalyzer';
import { PylintAnalyzer } from './analyzers/pylintAnalyzer';
import { BanditAnalyzer } from './analyzers/banditAnalyzer';
import { logger } from './loggerService';

/**
 * Register all static analyzers
 * Call this on application startup
 */
export async function registerAllAnalyzers(): Promise<void> {
  logger.info('Registering static analyzers...');

  // Register ESLint analyzer (JavaScript/TypeScript)
  const eslintAnalyzer = new ESLintAnalyzer();
  staticAnalysisService.registerAnalyzer(eslintAnalyzer);
  logger.info('✓ Registered ESLint analyzer');

  // Register Pylint analyzer (Python code quality)
  const pylintAnalyzer = new PylintAnalyzer();
  staticAnalysisService.registerAnalyzer(pylintAnalyzer);
  logger.info('✓ Registered Pylint analyzer');

  // Register Bandit analyzer (Python security)
  const banditAnalyzer = new BanditAnalyzer();
  staticAnalysisService.registerAnalyzer(banditAnalyzer);
  logger.info('✓ Registered Bandit analyzer');

  const registered = staticAnalysisService.getRegisteredAnalyzers();
  let totalAnalyzers = 0;
  for (const analyzers of registered.values()) {
    totalAnalyzers += analyzers.length;
  }

  logger.info(`Static analyzer registration complete. ${totalAnalyzers} analyzers for ${registered.size} languages.`);
}

/**
 * Check availability of static analysis tools
 * Returns a report of which tools are available
 */
export async function checkAnalyzerAvailability(): Promise<{
  eslint: boolean;
  pylint: boolean;
  bandit: boolean;
}> {
  const eslintAnalyzer = new ESLintAnalyzer();
  const pylintAnalyzer = new PylintAnalyzer();
  const banditAnalyzer = new BanditAnalyzer();

  const [eslint, pylint, bandit] = await Promise.all([
    eslintAnalyzer.isAvailable(),
    pylintAnalyzer.isAvailable(),
    banditAnalyzer.isAvailable(),
  ]);

  return {
    eslint,
    pylint,
    bandit,
  };
}

/**
 * Log static analyzer availability report
 */
export async function logAnalyzerAvailability(): Promise<void> {
  const availability = await checkAnalyzerAvailability();

  logger.info('Static Analyzer Availability:');
  logger.info(`  ESLint: ${availability.eslint ? '✓ Available' : '✗ Not available'}`);
  logger.info(`  Pylint: ${availability.pylint ? '✓ Available' : '✗ Not available'}`);
  logger.info(`  Bandit: ${availability.bandit ? '✓ Available' : '✗ Not available'}`);

  const availableCount = Object.values(availability).filter(Boolean).length;
  if (availableCount === 0) {
    logger.warn('No static analyzers available. Code quality checks will be limited.');
  }
}
