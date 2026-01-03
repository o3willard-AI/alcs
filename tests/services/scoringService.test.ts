import { calculateQualityScore, QualityScoreInputs } from '../../src/services/scoringService';
import { Defect, PolicyRule } from '../../src/types/mcp';
import { logger } from '../../src/services/loggerService';

// Mock the logger to prevent console output during tests
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('calculateQualityScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a baseline score of 100 with no issues', () => {
    const inputs: QualityScoreInputs = {
      defects: [],
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(100);
  });

  it('should deduct points for critical defects', () => {
    const inputs: QualityScoreInputs = {
      defects: [{ severity: 'critical', description: 'SQL Injection', category: 'Security', location: 'N/A' }],
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(75); // 100 - 25
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Deducting 25 points'));
  });

  it('should deduct points for major defects', () => {
    const inputs: QualityScoreInputs = {
      defects: [{ severity: 'major', description: 'Memory Leak', category: 'Performance', location: 'N/A' }],
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(90); // 100 - 10
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Deducting 10 points'));
  });

  it('should deduct points for minor defects', () => {
    const inputs: QualityScoreInputs = {
      defects: [{ severity: 'minor', description: 'Code style issue', category: 'Style', location: 'N/A' }],
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(97); // 100 - 3
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Deducting 3 points'));
  });

  it('should deduct points for info defects', () => {
    const inputs: QualityScoreInputs = {
      defects: [{ severity: 'info', description: 'Unused import', category: 'Clarity', location: 'N/A' }],
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(99); // 100 - 1
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Deducting 1 points'));
  });

  it('should deduct points for policy violations', () => {
    const inputs: QualityScoreInputs = {
      defects: [],
      policyViolations: [
        { id: 'P001', description: 'Violated policy', severity: 'medium', category: 'Compliance' },
      ],
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(95); // 100 - 5
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Deducting 5 points'));
  });

  it('should apply a penalty for low test coverage', () => {
    const inputs: QualityScoreInputs = {
      defects: [],
      testCoverage: 60, // Below 80%
    };
    const expectedPenalty = (80 - 60) / 5; // 4
    const score = calculateQualityScore(inputs);
    expect(score).toBe(100 - expectedPenalty); // 96
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Deducting 4.0 points for low test coverage'));
  });

  it('should apply a bonus for high test coverage and clamp to 100', () => {
    const inputs: QualityScoreInputs = {
      defects: [],
      testCoverage: 100, // Above 80%
    };
    // Bonus should be 2, but final score is clamped
    const score = calculateQualityScore(inputs);
    expect(score).toBe(100);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding 2.0 points for high test coverage'));
  });

  it('should not let the score go below 0', () => {
    const inputs: QualityScoreInputs = {
      defects: [
        { severity: 'critical', description: 'd1', category: 'c', location: 'l' },
        { severity: 'critical', description: 'd2', category: 'c', location: 'l' },
        { severity: 'critical', description: 'd3', category: 'c', location: 'l' },
        { severity: 'critical', description: 'd4', category: 'c', location: 'l' },
        { severity: 'critical', description: 'd5', category: 'c', location: 'l' },
      ], // -125 points
    };
    const score = calculateQualityScore(inputs);
    expect(score).toBe(0);
  });

  it('should calculate a combined score correctly', () => {
    const inputs: QualityScoreInputs = {
      defects: [
        { severity: 'critical', description: 'd1', category: 'c', location: 'l' }, // -25
        { severity: 'minor', description: 'd2', category: 'c', location: 'l' }, // -3
      ],
      policyViolations: [{ id: 'P1', description: 'dp1', severity: 'high', category: 'c' }], // -5
      testCoverage: 70, // -2 penalty ( (80-70)/5 )
    };
    // 100 - 25 - 3 - 5 - 2 = 65
    const score = calculateQualityScore(inputs);
    expect(score).toBe(65);
  });
});