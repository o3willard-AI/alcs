/**
 * Recommendation Service
 *
 * Generates intelligent recommendations based on session data, defect patterns,
 * quality trends, and best practices for different languages and frameworks.
 */

import { SessionState, Defect, Artifact } from '../types/mcp';
import { logger } from './loggerService';

export interface Recommendation {
  type: 'pattern' | 'trend' | 'stagnation' | 'language' | 'framework' | 'model' | 'general';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: string;
  actionable?: boolean;
}

export class RecommendationService {
  /**
   * Generate comprehensive recommendations for a session
   */
  async generateRecommendations(session: SessionState): Promise<Recommendation[]> {
    logger.info(`Generating recommendations for session ${session.session_id}`);

    const recommendations: Recommendation[] = [];

    // Analyze defect patterns
    const patternRecs = this.analyzeDefectPatterns(session);
    recommendations.push(...patternRecs);

    // Analyze quality trends
    const trendRecs = this.analyzeImprovementTrend(session);
    recommendations.push(...trendRecs);

    // Detect stagnation
    const stagnationRecs = this.detectStagnation(session);
    recommendations.push(...stagnationRecs);

    // Language-specific tips
    const languageRecs = this.generateLanguageTips(session);
    recommendations.push(...languageRecs);

    // Framework-specific tips
    const frameworkRecs = this.generateFrameworkTips(session);
    recommendations.push(...frameworkRecs);

    // Model performance analysis
    const modelRecs = this.analyzeModelPerformance(session);
    recommendations.push(...modelRecs);

    logger.info(`Generated ${recommendations.length} recommendations for session ${session.session_id}`);
    return recommendations;
  }

  /**
   * Analyze recurring defect patterns across iterations
   */
  private analyzeDefectPatterns(session: SessionState): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Extract all defects from review artifacts
    const allDefects = this.extractDefectsFromSession(session);

    if (allDefects.length === 0) {
      return recommendations;
    }

    // Group defects by type
    const defectsByType = new Map<string, Defect[]>();
    for (const defect of allDefects) {
      const type = defect.category || 'unknown';
      if (!defectsByType.has(type)) {
        defectsByType.set(type, []);
      }
      defectsByType.get(type)!.push(defect);
    }

    // Identify recurring defects (appear in multiple iterations)
    for (const [type, defects] of defectsByType.entries()) {
      if (defects.length >= 3) {
        // Same type appearing 3+ times suggests a pattern
        recommendations.push({
          type: 'pattern',
          severity: 'warning',
          message: `Recurring defect pattern detected: ${type}`,
          details: `This defect type has appeared ${defects.length} times. Consider addressing the root cause rather than fixing individual instances.`,
          actionable: true
        });
      }
    }

    // Identify high-severity defect patterns
    const criticalDefects = allDefects.filter(d => d.severity === 'critical');
    if (criticalDefects.length > 0) {
      recommendations.push({
        type: 'pattern',
        severity: 'critical',
        message: `${criticalDefects.length} critical defects found`,
        details: 'Critical defects require immediate attention before deployment.',
        actionable: true
      });
    }

    // Check for security-related defects
    const securityDefects = allDefects.filter(d =>
      d.description.toLowerCase().includes('security') ||
      d.description.toLowerCase().includes('vulnerability') ||
      d.description.toLowerCase().includes('injection')
    );

    if (securityDefects.length > 0) {
      recommendations.push({
        type: 'pattern',
        severity: 'critical',
        message: 'Security vulnerabilities detected',
        details: `Found ${securityDefects.length} security-related defects. Review and fix before deployment.`,
        actionable: true
      });
    }

    return recommendations;
  }

  /**
   * Analyze quality score trends across iterations
   */
  private analyzeImprovementTrend(session: SessionState): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const scores = session.score_history;

    if (scores.length < 2) {
      return recommendations;
    }

    // Calculate improvement rate
    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    const improvement = lastScore - firstScore;
    const improvementRate = (improvement / firstScore) * 100;

    if (improvement > 0) {
      if (improvementRate > 30) {
        recommendations.push({
          type: 'trend',
          severity: 'info',
          message: 'Excellent improvement trajectory',
          details: `Quality score improved by ${improvementRate.toFixed(1)}% from ${firstScore.toFixed(1)} to ${lastScore.toFixed(1)}.`,
          actionable: false
        });
      } else {
        recommendations.push({
          type: 'trend',
          severity: 'info',
          message: 'Quality improving steadily',
          details: `Quality score improved by ${improvementRate.toFixed(1)}%. Continue with current approach.`,
          actionable: false
        });
      }
    } else if (improvement < 0) {
      recommendations.push({
        type: 'trend',
        severity: 'warning',
        message: 'Quality score declining',
        details: `Quality score decreased by ${Math.abs(improvementRate).toFixed(1)}%. Review recent changes.`,
        actionable: true
      });
    }

    // Check if we're close to threshold
    const threshold = session.quality_threshold;
    const gap = threshold - lastScore;

    if (gap > 0 && gap <= 10) {
      recommendations.push({
        type: 'trend',
        severity: 'info',
        message: 'Close to quality threshold',
        details: `Only ${gap.toFixed(1)} points away from threshold of ${threshold}. One more iteration may suffice.`,
        actionable: true
      });
    }

    return recommendations;
  }

  /**
   * Detect when changes aren't improving quality (stagnation)
   */
  private detectStagnation(session: SessionState): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const scores = session.score_history;

    if (scores.length < 3) {
      return recommendations;
    }

    // Check last 3 scores for stagnation
    const lastThree = scores.slice(-3);
    const variance = this.calculateVariance(lastThree);

    // Low variance indicates stagnation
    if (variance < 5) {
      const avgScore = lastThree.reduce((sum, s) => sum + s, 0) / lastThree.length;

      if (avgScore < session.quality_threshold) {
        recommendations.push({
          type: 'stagnation',
          severity: 'warning',
          message: 'Quality score stagnating below threshold',
          details: `Score has been stable around ${avgScore.toFixed(1)} for the last 3 iterations without reaching threshold of ${session.quality_threshold}. Consider alternative approaches.`,
          actionable: true
        });
      } else {
        recommendations.push({
          type: 'stagnation',
          severity: 'info',
          message: 'Quality score stabilized',
          details: 'Score has stabilized above threshold. Ready for completion.',
          actionable: false
        });
      }
    }

    // Check if we're near max iterations
    if (session.current_iteration >= session.max_iterations - 1) {
      if (session.last_quality_score && session.last_quality_score < session.quality_threshold) {
        recommendations.push({
          type: 'stagnation',
          severity: 'critical',
          message: 'Approaching max iterations without reaching threshold',
          details: `On iteration ${session.current_iteration + 1} of ${session.max_iterations}. Consider escalation or adjusting requirements.`,
          actionable: true
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate language-specific recommendations
   */
  private generateLanguageTips(session: SessionState): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Detect language from artifacts
    const language = this.detectLanguage(session);
    if (!language) {
      return recommendations;
    }

    const tips = this.getLanguageBestPractices(language);
    if (tips) {
      recommendations.push({
        type: 'language',
        severity: 'info',
        message: `${language} best practices`,
        details: tips,
        actionable: true
      });
    }

    return recommendations;
  }

  /**
   * Generate framework-specific recommendations
   */
  private generateFrameworkTips(session: SessionState): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check for test coverage first
    const testArtifacts = session.artifacts.filter(a => a.type === 'test_suite');
    if (testArtifacts.length === 0 && session.last_quality_score !== undefined) {
      recommendations.push({
        type: 'framework',
        severity: 'warning',
        message: 'No test artifacts found',
        details: 'Consider generating tests to improve code quality and coverage.',
        actionable: true
      });
      // Return early since there are no tests to analyze
      return recommendations;
    }

    // Detect test framework from artifacts
    const framework = this.detectTestFramework(session);
    if (!framework) {
      return recommendations;
    }

    const tips = this.getFrameworkBestPractices(framework);
    if (tips) {
      recommendations.push({
        type: 'framework',
        severity: 'info',
        message: `${framework} testing tips`,
        details: tips,
        actionable: true
      });
    }

    return recommendations;
  }

  /**
   * Analyze model performance and suggest alternatives
   */
  private analyzeModelPerformance(session: SessionState): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // If quality is poor after multiple iterations, suggest model alternatives
    if (session.current_iteration >= 3 && session.last_quality_score && session.last_quality_score < 60) {
      recommendations.push({
        type: 'model',
        severity: 'info',
        message: 'Consider trying a different model',
        details: 'If quality remains low after multiple iterations, a more capable model might achieve better results.',
        actionable: true
      });
    }

    return recommendations;
  }

  /**
   * Extract all defects from session artifacts
   */
  private extractDefectsFromSession(session: SessionState): Defect[] {
    const defects: Defect[] = [];

    for (const artifact of session.artifacts) {
      if (artifact.type === 'review' && artifact.content) {
        try {
          const reviewData = JSON.parse(artifact.content);
          if (reviewData.defects && Array.isArray(reviewData.defects)) {
            defects.push(...reviewData.defects);
          }
          if (reviewData.all_defects && Array.isArray(reviewData.all_defects)) {
            defects.push(...reviewData.all_defects);
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    }

    return defects;
  }

  /**
   * Detect programming language from artifacts
   */
  private detectLanguage(session: SessionState): string | null {
    const codeArtifacts = session.artifacts.filter(a => a.type === 'code');

    for (const artifact of codeArtifacts) {
      if (artifact.metadata?.language) {
        return artifact.metadata.language;
      }
    }

    // Try to detect from content
    const content = codeArtifacts[0]?.content || '';
    if (content.includes('def ') || content.includes('import ')) return 'Python';
    if (content.includes('function ') || content.includes('const ')) return 'JavaScript';
    if (content.includes('func ') || content.includes('package ')) return 'Go';
    if (content.includes('class ') && content.includes('public ')) return 'Java';

    return null;
  }

  /**
   * Detect test framework from artifacts
   */
  private detectTestFramework(session: SessionState): string | null {
    const testArtifacts = session.artifacts.filter(a => a.type === 'test_suite');

    for (const artifact of testArtifacts) {
      if (artifact.metadata?.test_framework) {
        return artifact.metadata.test_framework;
      }
    }

    // Try to detect from content
    const content = testArtifacts[0]?.content || '';
    if (content.includes('pytest') || content.includes('def test_')) return 'pytest';
    if (content.includes('jest') || content.includes("test('")) return 'Jest';
    if (content.includes('func Test')) return 'go test';
    if (content.includes('@Test')) return 'JUnit';

    return null;
  }

  /**
   * Get language-specific best practices
   */
  private getLanguageBestPractices(language: string): string | null {
    const practices: Record<string, string> = {
      'Python': 'Follow PEP 8 style guidelines. Use type hints for better code clarity. Prefer list comprehensions over loops where appropriate. Use context managers (with statements) for resource management.',
      'JavaScript': 'Use const/let instead of var. Prefer arrow functions for callbacks. Use async/await for asynchronous code. Enable strict mode ("use strict").',
      'TypeScript': 'Enable strict mode in tsconfig.json. Use interfaces for object shapes. Avoid using "any" type. Leverage union types and type guards.',
      'Go': 'Follow Go conventions: use gofmt, keep functions small, handle errors explicitly. Use defer for cleanup. Avoid premature optimization.',
      'Java': 'Follow Java naming conventions. Use meaningful variable names. Prefer composition over inheritance. Handle exceptions appropriately.',
      'Rust': 'Embrace ownership and borrowing. Use Result<T, E> for error handling. Avoid unwrap() in production code. Leverage the type system.',
    };

    return practices[language] || null;
  }

  /**
   * Get framework-specific best practices
   */
  private getFrameworkBestPractices(framework: string): string | null {
    const practices: Record<string, string> = {
      'pytest': 'Use fixtures for setup/teardown. Organize tests with clear names (test_function_does_x). Use parametrize for testing multiple inputs. Aim for 80%+ coverage.',
      'Jest': 'Use describe() blocks to group related tests. Use beforeEach() for common setup. Mock external dependencies. Test both success and error cases.',
      'go test': 'Use table-driven tests for multiple cases. Use t.Helper() for test helpers. Test exported functions. Use subtests with t.Run().',
      'JUnit': 'Use @BeforeEach and @AfterEach for setup/teardown. Test one concept per test method. Use assertions from JUnit or AssertJ. Organize tests by class.',
    };

    return practices[framework] || null;
  }

  /**
   * Calculate variance of a number array
   */
  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0;

    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    const variance = squaredDiffs.reduce((sum, n) => sum + n, 0) / numbers.length;

    return Math.sqrt(variance); // Return standard deviation
  }
}

// Singleton instance
export const recommendationService = new RecommendationService();
