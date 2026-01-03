import { getSessionState, updateSessionState, addArtifact } from '../sessionManager';
import { RunCriticReviewParams, RunCriticReviewResponse, StateMachineState, ReviewFeedback, Artifact, PolicyRule, Defect } from '../types/mcp';
import { logger } from '../services/loggerService';
import { AgentBeta } from '../agents/agentBeta';
import { calculateQualityScore } from '../services/scoringService';
import { configManager } from '../services/configService';
import { testRunnerService } from '../services/testRunnerService';
import { staticAnalysisService } from '../services/staticAnalysisService';
import { tempFileManager } from '../services/tempFileManager';

/**
 * Triggers Agent Beta to perform a comprehensive code review on an artifact.
 */
export async function run_critic_review(session_id: string, params: RunCriticReviewParams): Promise<RunCriticReviewResponse> { // session_id added
  const { artifact_id, review_depth } = params;

  const session = await getSessionState(session_id); // Use provided session_id

  if (!session) {
    logger.error(`run_critic_review: Session with ID ${session_id} not found.`);
    throw new Error(`Session with ID ${session_id} not found.`);
  }

  const artifactToReview = session.artifacts.find(a => a.id === artifact_id && a.type === 'code');

  if (!artifactToReview) {
    logger.error(`run_critic_review: Code artifact with ID ${artifact_id} not found in session ${session.session_id}.`);
    throw new Error(`Code artifact with ID ${artifact_id} not found.`);
  }

  logger.info(`run_critic_review: Starting critic review for artifact ${artifact_id} at depth ${review_depth}.`);

  // Instantiate Agent Beta and get the review
  const agentBeta = new AgentBeta();
  const reviewFeedback = await agentBeta.reviewArtifact(artifactToReview);

  // Execute real tests if test artifact exists
  let testCoverage = 0;
  const testDefects: Defect[] = [];

  const testArtifact = testRunnerService.findTestArtifact(session.artifacts, artifact_id);
  if (testArtifact) {
    try {
      // Detect framework from test artifact
      const framework = testRunnerService.detectFramework(testArtifact);

      if (framework && testRunnerService.isFrameworkSupported(framework)) {
        logger.info(`run_critic_review: Executing tests with framework ${framework}`);

        const testResult = await testRunnerService.executeTests(
          artifactToReview,
          testArtifact,
          framework,
          {
            timeout_seconds: 300,
            memory_limit_mb: 512,
            cpu_limit: 1.0,
            enable_network: false,
          }
        );

        testCoverage = testResult.coverage_percentage;

        // Convert test failures to defects
        const testFailureDefects = testRunnerService.mapFailuresToDefects(testResult);
        testDefects.push(...testFailureDefects);

        logger.info(`run_critic_review: Test execution complete. Coverage: ${testCoverage.toFixed(2)}%, Failures: ${testResult.failed_tests}`);
      } else {
        logger.warn(`run_critic_review: Test framework ${framework} not supported or could not be detected`);
      }
    } catch (error: any) {
      logger.error(`run_critic_review: Test execution failed: ${error.message}`);
      // Continue with review even if tests fail
    }
  } else {
    logger.info(`run_critic_review: No test artifact found for code artifact ${artifact_id}`);
  }

  // Execute static analysis for policy violations
  const staticAnalysisDefects: Defect[] = [];
  const policyViolations: PolicyRule[] = [];

  try {
    // Create temporary workspace for static analysis
    const workspace = await tempFileManager.createTempWorkspace(session_id);

    logger.info(`run_critic_review: Running static analysis`);

    // TODO: Load actual policies from organization config
    // For now, we'll run analyzers without specific policy filtering
    const analysisResult = await staticAnalysisService.analyzeCode(
      artifactToReview,
      workspace
    );

    // Convert violations to defects
    const staticDefects = staticAnalysisService.mapViolationsToDefects(analysisResult);
    staticAnalysisDefects.push(...staticDefects);

    logger.info(`run_critic_review: Static analysis found ${analysisResult.total_violations} violations`);

    // Clean up workspace
    await tempFileManager.cleanup(workspace);

  } catch (error: any) {
    logger.error(`run_critic_review: Static analysis failed: ${error.message}`);
    // Continue with review even if static analysis fails
  }

  // Combine all defects: Agent Beta review + test failures + static analysis
  const allDefects = [
    ...reviewFeedback.defects,
    ...testDefects,
    ...staticAnalysisDefects,
  ];

  // Calculate the final quality score
  const quality_score = calculateQualityScore({
    defects: allDefects,
    testCoverage: testCoverage,
    policyViolations: policyViolations,
  });


  // Update session state
  session.last_quality_score = quality_score;
  session.score_history.push(quality_score);

  // Add review as an artifact
  const reviewArtifact: Artifact = {
    id: `review-${artifact_id}-${Date.now()}`,
    type: 'review',
    description: `Review for artifact ${artifact_id}`,
    timestamp: Date.now(),
    content: JSON.stringify({
      ...reviewFeedback,
      test_coverage: testCoverage,
      test_defects: testDefects,
      all_defects: allDefects,
    }),
    metadata: {
      quality_score,
      test_coverage: testCoverage,
      policy_violations: policyViolations,
      review_depth,
    }
  };

  // Add artifact to database
  await addArtifact(session_id, reviewArtifact);

  // Update local session object for consistency
  session.artifacts.push(reviewArtifact);
  await updateSessionState(session);

  // Determine recommendation based on quality score
  const qualityThreshold = configManager.config.default_quality_threshold;
  let recommendation: 'approve' | 'revise' | 'escalate';
  if (quality_score >= qualityThreshold) {
    recommendation = 'approve';
  } else if (session.current_iteration < session.max_iterations) {
    recommendation = 'revise';
  } else {
    recommendation = 'escalate';
  }

  logger.info(`run_critic_review: Review complete for artifact ${artifact_id}. Quality Score: ${quality_score}, Coverage: ${testCoverage.toFixed(2)}%, Recommendation: ${recommendation}.`);

  return {
    review_id: reviewArtifact.id,
    quality_score,
    defects: allDefects, // Return combined defects
    test_coverage_estimate: testCoverage, // Now real coverage, not estimate!
    policy_violations: policyViolations,
    suggestions: reviewFeedback.suggestions,
    recommendation,
    required_changes: reviewFeedback.required_changes,
  };
}