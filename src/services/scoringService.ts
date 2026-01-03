import { Defect, PolicyRule } from '../types/mcp';
import { logger } from './loggerService';

export interface QualityScoreInputs {
  defects: Defect[];
  testCoverage?: number; // Percentage, 0-100
  policyViolations?: PolicyRule[];
}

// Define the weight of each severity level
const SEVERITY_WEIGHTS: Record<Defect['severity'], number> = {
  critical: 25,
  major: 10,
  minor: 3,
  info: 1,
};

const MAX_SCORE = 100;
const MIN_TEST_COVERAGE_BONUS_THRESHOLD = 80;

/**
 * Calculates a quality score based on defects, test coverage, and policy violations.
 * @param inputs The inputs for calculating the quality score.
 * @returns A score from 0 to 100.
 */
export function calculateQualityScore(inputs: QualityScoreInputs): number {
  let score = MAX_SCORE;

  // 1. Deduct points for defects
  if (inputs.defects && inputs.defects.length > 0) {
    inputs.defects.forEach(defect => {
      const deduction = SEVERITY_WEIGHTS[defect.severity] || 0;
      score -= deduction;
      logger.debug(`Deducting ${deduction} points for defect: ${defect.description}`);
    });
  }

  // 2. Deduct points for policy violations
  if (inputs.policyViolations && inputs.policyViolations.length > 0) {
    inputs.policyViolations.forEach(violation => {
      // For simplicity, deduct 5 points for any policy violation for now
      score -= 5;
      logger.debug(`Deducting 5 points for policy violation: ${violation.id}`);
    });
  }

  // 3. Apply bonus/penalty for test coverage
  //    No penalty if testCoverage is undefined
  if (inputs.testCoverage !== undefined) {
    if (inputs.testCoverage < MIN_TEST_COVERAGE_BONUS_THRESHOLD) {
      // Penalize for low test coverage
      const coveragePenalty = (MIN_TEST_COVERAGE_BONUS_THRESHOLD - inputs.testCoverage) / 5; // e.g., 60% coverage = 4 point penalty
      score -= coveragePenalty;
      logger.debug(`Deducting ${coveragePenalty.toFixed(1)} points for low test coverage (${inputs.testCoverage}%)`);
    } else {
      // Small bonus for high test coverage
      const coverageBonus = (inputs.testCoverage - MIN_TEST_COVERAGE_BONUS_THRESHOLD) / 10; // e.g., 100% coverage = 2 point bonus
      score += coverageBonus;
      logger.debug(`Adding ${coverageBonus.toFixed(1)} points for high test coverage (${inputs.testCoverage}%)`);
    }
  }

  // Ensure score is within the 0-100 range
  score = Math.max(0, Math.min(MAX_SCORE, score));
  const finalScore = Math.round(score);

  logger.info(`Calculated final quality score: ${finalScore}`);
  return finalScore;
}
