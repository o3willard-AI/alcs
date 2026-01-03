import { getSessionState, updateSessionState, addArtifact } from '../sessionManager';
import { GenerateTestSuiteParams, GenerateTestSuiteResponse, StateMachineState, Artifact } from '../types/mcp';
import { logger } from '../services/loggerService';
import { AgentBeta } from '../agents/agentBeta';

/**
 * Triggers Agent Beta to generate a test suite for a code artifact.
 */
export async function generate_test_suite(params: GenerateTestSuiteParams): Promise<GenerateTestSuiteResponse> {
  const { artifact_id, framework, coverage_target = 80 } = params;

  // For this implementation, we will assume the review is always for the 'current' session
  const defaultSessionId = 'default-active-session';
  const session = await getSessionState(defaultSessionId);

  if (!session) {
    logger.error(`generate_test_suite: Session with ID ${defaultSessionId} not found.`);
    throw new Error(`Session with ID ${defaultSessionId} not found.`);
  }

  const artifactToTest = session.artifacts.find(a => a.id === artifact_id && a.type === 'code');

  if (!artifactToTest) {
    logger.error(`generate_test_suite: Code artifact with ID ${artifact_id} not found in session ${session.session_id}.`);
    throw new Error(`Code artifact with ID ${artifact_id} not found.`);
  }

  logger.info(`generate_test_suite: Starting test suite generation for artifact ${artifact_id} using ${framework}.`);

  const agentBeta = new AgentBeta();
  const testCode = await agentBeta.generateTestSuite(artifactToTest, framework, coverage_target);

  // Estimate test count and coverage (mocked for now)
  const test_count = (testCode.match(/it\(/g) || []).length;
  const estimated_coverage = 85; // Mock value

  // Create a new artifact for the test suite
  const testArtifact: Artifact = {
    id: `test-${artifact_id}-${Date.now()}`,
    type: 'test_suite',
    description: `Test suite for artifact ${artifact_id}`,
    timestamp: Date.now(),
    content: testCode,
    metadata: {
      framework,
      test_count,
      estimated_coverage,
    },
  };

  // Add artifact to database
  await addArtifact(defaultSessionId, testArtifact);

  // Update local session object for consistency
  session.artifacts.push(testArtifact);
  await updateSessionState(session);

  logger.info(`generate_test_suite: Test suite generated for artifact ${artifact_id}. Test count: ${test_count}.`);

  return {
    test_artifact_id: testArtifact.id,
    test_count,
    estimated_coverage,
    test_code: testCode,
  };
}
