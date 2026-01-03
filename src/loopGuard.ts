import { SessionState, LoopGuardConfig } from './types/mcp';
import { logger } from './services/loggerService';
import { createHash } from 'crypto';

export class LoopGuard {
  private session: SessionState;
  private config: LoopGuardConfig;

  constructor(session: SessionState, config: LoopGuardConfig) {
    this.session = session;
    this.config = config;
  }

  /**
   * Checks if the review-revise loop should continue based on termination conditions.
   * @param newArtifactContent Optional: The content of the new artifact to check for oscillation.
   * @returns An object with `shouldContinue` boolean and a `reason` for termination.
   */
  public shouldContinue(newArtifactContent?: string): { shouldContinue: boolean; reason?: string } {
    // 1. Check Iteration Cap
    if (this.session.current_iteration >= this.session.max_iterations) {
      const reason = `Iteration cap reached (${this.session.max_iterations}).`;
      logger.warn(`LoopGuard: ${reason}`);
      return { shouldContinue: false, reason };
    }

    // 2. Check Timeout
    const sessionDurationMs = Date.now() - this.session.start_time;
    const timeoutMs = this.session.task_timeout_minutes * 60 * 1000;
    if (sessionDurationMs > timeoutMs) {
      const reason = `Task timeout exceeded (${this.session.task_timeout_minutes} minutes).`;
      logger.warn(`LoopGuard: ${reason}`);
      return { shouldContinue: false, reason };
    }

    // 3. Check for Oscillation
    if (newArtifactContent && this.config.oscillationDetection) {
      const contentHash = createHash('sha256').update(newArtifactContent).digest('hex');
      if (this.session.content_hashes.has(contentHash)) {
        const reason = 'Oscillation detected: an identical artifact has been produced before.';
        logger.warn(`LoopGuard: ${reason}`);
        return { shouldContinue: false, reason };
      }
      // Add the new hash for future checks
      this.session.content_hashes.add(contentHash);
    }

    // 4. Check for Stagnation
    const scoreHistory = this.session.score_history;
    if (scoreHistory.length >= this.config.stagnationWindow) {
      const recentScores = scoreHistory.slice(-this.config.stagnationWindow);
      const deltas = recentScores.map((s, i) => i === 0 ? 0 : Math.abs(s - recentScores[i-1]));
      if (deltas.slice(1).every(d => d < this.config.stagnationThreshold)) {
        const reason = `Stagnation detected: score has not improved by at least ${this.config.stagnationThreshold} for ${this.config.stagnationWindow} iterations.`;
        logger.warn(`LoopGuard: ${reason}`);
        return { shouldContinue: false, reason };
      }
    }
    
    return { shouldContinue: true };
  }
}
