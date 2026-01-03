import { execute_task_spec } from './tools/executeTaskSpec';
import { run_critic_review } from './tools/runCriticReview';
import { revise_code } from './tools/reviseCode';
import { get_progress_summary } from './tools/getProgressSummary';
import { final_handoff_archive } from './tools/finalHandoffArchive';
import { handle_escalation } from './handlers/escalationHandler';

import { SessionState, TaskSpec, StateMachineState, ReviewFeedback, Artifact, EscalationReason, EscalationMessage } from './types/mcp'; // Added EscalationMessage
import { configManager } from './services/configService';
import { logger } from './services/loggerService';
import { getSessionState, createSessionState, updateSessionState, deleteSessionState, addArtifact } from './sessionManager';
import { StateMachine } from './stateMachine';
import { LoopGuard } from './loopGuard';
import { AgentAlpha } from './agents/agentAlpha';
import { AgentBeta } from './agents/agentBeta';


interface OrchestratorOptions {
  max_iterations?: number;
  quality_threshold?: number;
  task_timeout_minutes?: number;
  // Add other orchestrator-specific options here
}

export class CodingSessionOrchestrator {
  private sessionId: string;
  private stateMachine!: StateMachine;
  private loopGuard!: LoopGuard;
  private agentAlpha: AgentAlpha;
  private agentBeta: AgentBeta;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.agentAlpha = new AgentAlpha();
    this.agentBeta = new AgentBeta();
  }

  private async initialize(): Promise<void> {
    const session = await getSessionState(this.sessionId);
    if (!session) {
      throw new Error(`Orchestrator initialized with non-existent session ID: ${this.sessionId}`);
    }
    this.stateMachine = new StateMachine(session);
    this.loopGuard = new LoopGuard(session, {
      stagnationThreshold: 2, // From PRD
      stagnationWindow: 2, // From PRD
      oscillationDetection: true, // From PRD
    });
  }

  /**
   * Drives a full coding session from initial task execution to final handoff or escalation.
   * @param taskSpec The initial task specification.
   * @param options Orchestrator options for this session.
   * @returns A promise resolving to the final archive ID or an escalation message.
   */
  public async startCodingSession(taskSpec: TaskSpec, options?: OrchestratorOptions): Promise<string | EscalationMessage> {
    await this.initialize();

    const session = await getSessionState(this.sessionId);
    if (!session) {
      throw new Error(`Session ${this.sessionId} not found`);
    }

    try {
      // 1. Initial Task Execution (via execute_task_spec)
      this.stateMachine.transitionTo(StateMachineState.GENERATING);
      const executeResponse = await execute_task_spec({
        spec: taskSpec,
        max_iterations: options?.max_iterations,
        quality_threshold: options?.quality_threshold,
      });

      if (executeResponse.status === 'rejected') {
        logger.error(`Orchestrator: Task rejected by execute_task_spec: ${executeResponse.rejection_reason}`);
        this.stateMachine.transitionTo(StateMachineState.FAILED);
        // Construct a minimal EscalationMessage for rejection
        return await handle_escalation(this.sessionId, 'max_iterations_reached' as EscalationReason); // Or a more specific rejection reason
      }

      // Update session with actual max_iterations and quality_threshold used by execute_task_spec
      session.max_iterations = options?.max_iterations || configManager.config.default_max_iterations;
      session.quality_threshold = options?.quality_threshold || configManager.config.default_quality_threshold;
      session.task_timeout_minutes = options?.task_timeout_minutes || configManager.config.task_timeout_minutes;
      await updateSessionState(session);

      let currentCodeArtifact: Artifact | undefined;

      // 2. Initial Code Generation by Agent Alpha
      logger.info(`Orchestrator: Agent Alpha starting initial code generation...`);
      const generatedCodeContent = await this.agentAlpha.generate(taskSpec);
      currentCodeArtifact = {
        id: `code-${Date.now()}-initial`,
        type: 'code',
        description: 'Initial code generation',
        timestamp: Date.now(),
        content: generatedCodeContent,
        metadata: { iteration: session.current_iteration + 1 },
      };

      // Save artifact to database
      await addArtifact(this.sessionId, currentCodeArtifact);

      // Reload session to get updated artifacts list
      const reloadedSession = await getSessionState(this.sessionId);
      if (!reloadedSession) {
        throw new Error(`Session ${this.sessionId} not found after adding artifact`);
      }
      session.artifacts = reloadedSession.artifacts;
      await updateSessionState(session);


      // 3. Main Review-Revise Loop
      while (true) {
        // Transition to REVIEWING state
        this.stateMachine.transitionTo(StateMachineState.REVIEWING);
        logger.info(`Orchestrator: Agent Beta reviewing artifact ${currentCodeArtifact.id}...`);

        const reviewResponse = await run_critic_review(this.sessionId, { // Pass session_id
          artifact_id: currentCodeArtifact.id,
          review_depth: 'standard', // Orchestrator can decide depth
        });

        // Update session's last_quality_score and score_history (already done in run_critic_review)
        // Retrieve updated session
        const updatedSession = await getSessionState(this.sessionId);

        if (reviewResponse.recommendation === 'approve') {
          logger.info(`Orchestrator: Review approved (Score: ${reviewResponse.quality_score}). Converging session.`);
          this.stateMachine.transitionTo(StateMachineState.CONVERGED);
          break; // Exit loop, task completed
        }

        // Check LoopGuard conditions before potentially revising
        const loopCheck = this.loopGuard.shouldContinue(currentCodeArtifact.content);
        if (!loopCheck.shouldContinue) {
          logger.warn(`Orchestrator: Loop termination condition met: ${loopCheck.reason}`);
          this.stateMachine.transitionTo(StateMachineState.ESCALATED);
          return await handle_escalation(this.sessionId, 'max_iterations_reached' as EscalationReason); // Specific reason based on loopCheck.reason
        }

        // Recommendation is 'revise', so transition to REVISING
        this.stateMachine.transitionTo(StateMachineState.REVISING);
        logger.info(`Orchestrator: Agent Alpha revising code for artifact ${currentCodeArtifact.id}...`);

        // Construct ReviewFeedback object from RunCriticReviewResponse
        const feedbackForRevision: ReviewFeedback = {
          quality_score: reviewResponse.quality_score,
          defects: reviewResponse.defects,
          suggestions: reviewResponse.suggestions,
          required_changes: reviewResponse.required_changes,
        };

        const revisedArtifact = await revise_code({
          session_id: this.sessionId, // Pass session ID
          artifact_id: currentCodeArtifact.id,
          feedback: feedbackForRevision, // Pass the constructed feedback
        });
        currentCodeArtifact = revisedArtifact; // Update current artifact

        // Reload session to get updated artifacts list
        const reloadedAfterRevision = await getSessionState(this.sessionId);
        if (reloadedAfterRevision) {
          session.artifacts = reloadedAfterRevision.artifacts;
        }
        await updateSessionState(session);

        // Optional: Get progress summary for logging
        const progress = await get_progress_summary({ session_id: this.sessionId });
        logger.info(`Orchestrator: Iteration ${progress.iterations_completed} completed. State: ${progress.current_state}, Score: ${progress.quality_scores.slice(-1)[0]}, Trend: ${progress.convergence_trend}`);
      }

      // 4. Final Handoff
      if (this.stateMachine.getCurrentState() === StateMachineState.CONVERGED) {
        logger.info('Orchestrator: Session converged. Performing final handoff...');
        const handoffResponse = await final_handoff_archive({ session_id: this.sessionId, include_audit: true });
        this.stateMachine.transitionTo(StateMachineState.IDLE); // Reset after handoff
        return handoffResponse.archive_id;
      } else {
        // This case should ideally be caught by break in loop or escalation return
        logger.error(`Orchestrator: Unexpected state at loop exit: ${this.stateMachine.getCurrentState()}`);
        this.stateMachine.transitionTo(StateMachineState.FAILED);
        return await handle_escalation(this.sessionId, 'max_iterations_reached'); // Default reason
      }

    } catch (error: any) {
      logger.error(`Orchestrator: An unhandled error occurred during session ${this.sessionId}: ${error.message}`);
      this.stateMachine.transitionTo(StateMachineState.FAILED);
      return await handle_escalation(this.sessionId, 'max_iterations_reached'); // Generic error escalation
    } finally {
      // Clean up session data if it's in a terminal state
      const finalSession = await getSessionState(this.sessionId);
      if (finalSession && (finalSession.state === StateMachineState.IDLE || finalSession.state === StateMachineState.FAILED || finalSession.state === StateMachineState.ESCALATED)) {
        // deleteSessionState(this.sessionId); // Decide if session should be deleted or kept for history
        logger.info(`Orchestrator: Session ${this.sessionId} reached terminal state ${finalSession.state}.`);
      }
    }
  }
}
