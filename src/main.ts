import { CodingSessionOrchestrator } from './orchestrator';
import { createSessionState } from './sessionManager';
import { TaskSpec, EscalationMessage } from './types/mcp';
import { logger } from './services/loggerService';
import { registerAllTestRunners, logTestToolAvailability } from './services/testRunnerRegistry';
import { registerAllAnalyzers, logAnalyzerAvailability } from './services/staticAnalysisRegistry';

async function main() {
  // Initialize test runners
  await registerAllTestRunners();
  await logTestToolAvailability();

  // Initialize static analyzers
  await registerAllAnalyzers();
  await logAnalyzerAvailability();

  const sessionId = `cli-session-${Date.now()}`;
  logger.info(`CLI: Starting new coding session: ${sessionId}`);

  // Create initial session state
  createSessionState(sessionId);

  // Define a sample TaskSpec
  const taskSpec: TaskSpec = {
    description: 'Implement a simple "Hello, World!" function in Python. The function should be named `say_hello` and return the string "Hello, World!".',
    language: 'Python',
    constraints: ['The function should not take any arguments.', 'Adhere to PEP 8 style guidelines.'],
    examples: [
      {
        description: 'Example usage of say_hello',
        code: `if __name__ == "__main__":\n    print(say_hello())`,
        language: 'python'
      }
    ]
  };

  const orchestrator = new CodingSessionOrchestrator(sessionId);

  try {
    const finalResult = await orchestrator.startCodingSession(taskSpec, {
      max_iterations: 3,
      quality_threshold: 80,
      task_timeout_minutes: 5,
    });

    if (typeof finalResult === 'string') {
      logger.info(`CLI: Coding session ${sessionId} completed successfully. Final Archive ID: ${finalResult}`);
    } else {
      logger.warn(`CLI: Coding session ${sessionId} escalated. Reason: ${finalResult.reason}`);
      logger.warn(`CLI: Escalation Message: ${JSON.stringify(finalResult, null, 2)}`);
    }
  } catch (error: any) {
    logger.error(`CLI: An unexpected error occurred during orchestration: ${error.message}`);
    process.exit(1);
  } finally {
    // Optional: cleanup session if desired
    // deleteSessionState(sessionId);
    logger.info(`CLI: Orchestration process for session ${sessionId} finished.`);
  }
}

main().catch(error => {
  logger.error(`CLI: Unhandled error in main function: ${error.message}`);
  process.exit(1);
});
