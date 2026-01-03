/**
 * Database Seeding Script
 *
 * Seeds the database with sample data for development and testing.
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // Clean existing data
  console.log('Cleaning existing data...');
  await prisma.artifact.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.session.deleteMany({});

  // Create sample sessions
  console.log('Creating sample sessions...');

  // Session 1: Idle session
  const session1 = await prisma.session.create({
    data: {
      id: 'seed-session-1',
      state: 'IDLE',
      current_iteration: 0,
      max_iterations: 5,
      quality_threshold: 85,
      score_history: [],
      content_hashes: [],
      elapsed_time_ms: BigInt(0),
      start_time: BigInt(Date.now()),
      task_timeout_minutes: 30,
      time_per_iteration_ms: [],
    },
  });
  console.log(`Created session: ${session1.id}`);

  // Session 2: Active session with artifacts
  const session2 = await prisma.session.create({
    data: {
      id: 'seed-session-2',
      state: 'REVIEWING',
      current_iteration: 2,
      max_iterations: 5,
      quality_threshold: 85,
      last_quality_score: 78,
      score_history: [75, 78],
      content_hashes: ['hash-code-1', 'hash-code-2'],
      elapsed_time_ms: BigInt(45000),
      start_time: BigInt(Date.now() - 45000),
      task_timeout_minutes: 30,
      time_per_iteration_ms: [BigInt(20000), BigInt(25000)],
      artifacts: {
        create: [
          {
            id: 'seed-artifact-1',
            type: 'code',
            description: 'Initial code generation',
            content: `
/**
 * Sample Calculator Class
 */
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }
}

export default Calculator;
            `.trim(),
            metadata: {
              language: 'typescript',
              iteration: 1,
            },
            timestamp: BigInt(Date.now() - 45000),
          },
          {
            id: 'seed-artifact-2',
            type: 'review',
            description: 'First code review',
            content: JSON.stringify({
              defects: [
                {
                  severity: 'medium',
                  description: 'Missing input validation',
                  location: 'add method',
                },
              ],
              suggestions: [
                'Add input type checking',
                'Add JSDoc comments',
                'Consider adding more error handling',
              ],
            }),
            metadata: {
              quality_score: 75,
              test_coverage_estimate: 60,
            },
            timestamp: BigInt(Date.now() - 25000),
          },
          {
            id: 'seed-artifact-3',
            type: 'code',
            description: 'Revised code after review',
            content: `
/**
 * Enhanced Calculator Class with validation
 */
class Calculator {
  /**
   * Adds two numbers
   * @param a First number
   * @param b Second number
   * @returns Sum of a and b
   * @throws Error if inputs are not numbers
   */
  add(a: number, b: number): number {
    this.validateInput(a, b);
    return a + b;
  }

  /**
   * Subtracts b from a
   * @param a First number
   * @param b Second number
   * @returns Difference of a and b
   * @throws Error if inputs are not numbers
   */
  subtract(a: number, b: number): number {
    this.validateInput(a, b);
    return a - b;
  }

  /**
   * Multiplies two numbers
   * @param a First number
   * @param b Second number
   * @returns Product of a and b
   * @throws Error if inputs are not numbers
   */
  multiply(a: number, b: number): number {
    this.validateInput(a, b);
    return a * b;
  }

  /**
   * Divides a by b
   * @param a Numerator
   * @param b Denominator
   * @returns Quotient of a and b
   * @throws Error if b is zero or inputs are not numbers
   */
  divide(a: number, b: number): number {
    this.validateInput(a, b);
    if (b === 0) {
      throw new Error('Division by zero is not allowed');
    }
    return a / b;
  }

  /**
   * Validates that inputs are numbers
   * @param a First input
   * @param b Second input
   * @throws Error if inputs are not numbers
   */
  private validateInput(a: any, b: any): void {
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new Error('Inputs must be numbers');
    }
    if (isNaN(a) || isNaN(b)) {
      throw new Error('Inputs must be valid numbers');
    }
  }
}

export default Calculator;
            `.trim(),
            metadata: {
              language: 'typescript',
              iteration: 2,
              revision_of: 'seed-artifact-1',
            },
            timestamp: BigInt(Date.now()),
          },
        ],
      },
    },
  });
  console.log(`Created session with artifacts: ${session2.id}`);

  // Session 3: Converged session
  const session3 = await prisma.session.create({
    data: {
      id: 'seed-session-3',
      state: 'CONVERGED',
      current_iteration: 3,
      max_iterations: 5,
      quality_threshold: 85,
      last_quality_score: 92,
      score_history: [75, 85, 92],
      content_hashes: ['hash-1', 'hash-2', 'hash-3'],
      elapsed_time_ms: BigInt(120000),
      start_time: BigInt(Date.now() - 120000),
      task_timeout_minutes: 30,
      time_per_iteration_ms: [BigInt(40000), BigInt(35000), BigInt(45000)],
      artifacts: {
        create: [
          {
            id: 'seed-artifact-4',
            type: 'test_suite',
            description: 'Unit tests for Calculator',
            content: `
import Calculator from './Calculator';

describe('Calculator', () => {
  let calc: Calculator;

  beforeEach(() => {
    calc = new Calculator();
  });

  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(calc.add(2, 3)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(calc.add(-5, 3)).toBe(-2);
    });

    it('should throw error for invalid inputs', () => {
      expect(() => calc.add(NaN, 5)).toThrow('Inputs must be valid numbers');
    });
  });

  describe('divide', () => {
    it('should divide two numbers', () => {
      expect(calc.divide(10, 2)).toBe(5);
    });

    it('should throw error for division by zero', () => {
      expect(() => calc.divide(10, 0)).toThrow('Division by zero');
    });
  });
});
            `.trim(),
            metadata: {
              framework: 'jest',
              test_count: 4,
              estimated_coverage: 95,
            },
            timestamp: BigInt(Date.now()),
          },
        ],
      },
    },
  });
  console.log(`Created converged session: ${session3.id}`);

  // Create sample reviews
  console.log('Creating sample reviews...');

  await prisma.review.create({
    data: {
      id: 'seed-review-1',
      session_id: 'seed-session-2',
      artifact_id: 'seed-artifact-1',
      review_depth: 'standard',
      quality_score: 75,
      defects: [
        {
          severity: 'medium',
          description: 'Missing input validation',
          location: 'add method',
        },
      ],
      test_coverage_estimate: 60,
      policy_violations: [],
      suggestions: ['Add input validation', 'Add JSDoc comments'],
      recommendation: 'revise',
      required_changes: ['Add input type checking'],
      timestamp: BigInt(Date.now() - 25000),
    },
  });

  await prisma.review.create({
    data: {
      id: 'seed-review-2',
      session_id: 'seed-session-3',
      artifact_id: 'seed-artifact-4',
      review_depth: 'comprehensive',
      quality_score: 92,
      defects: [],
      test_coverage_estimate: 95,
      policy_violations: [],
      suggestions: ['Consider edge case testing'],
      recommendation: 'approve',
      required_changes: [],
      timestamp: BigInt(Date.now()),
    },
  });

  console.log('Seeding completed successfully!');
  console.log('Created:');
  console.log('  - 3 sessions');
  console.log('  - 4 artifacts');
  console.log('  - 2 reviews');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
