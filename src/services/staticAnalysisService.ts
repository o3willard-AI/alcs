/**
 * Static Analysis Service
 *
 * Orchestrates static code analysis using various tools (ESLint, Pylint, Bandit, etc.)
 * Detects policy violations, code quality issues, and security vulnerabilities.
 */

import { Artifact, StaticAnalysisResult, StaticAnalysisViolation, PolicyRule, Defect } from '../types/mcp';
import { logger } from './loggerService';
import { metricsService } from './metricsService';

/**
 * Base interface for language-specific static analyzers
 */
export interface StaticAnalyzer {
  language: string;
  toolName: string;

  /**
   * Analyze code artifact
   * @param artifact Code artifact to analyze
   * @param workspacePath Path to temporary workspace
   * @returns Analysis result with violations
   */
  analyze(
    artifact: Artifact,
    workspacePath: string
  ): Promise<StaticAnalysisViolation[]>;

  /**
   * Check if analyzer tool is available
   */
  isAvailable(): Promise<boolean>;
}

export class StaticAnalysisService {
  private analyzers: Map<string, StaticAnalyzer[]> = new Map();

  /**
   * Register a static analyzer for a specific language
   * @param analyzer Static analyzer instance
   */
  registerAnalyzer(analyzer: StaticAnalyzer): void {
    const existing = this.analyzers.get(analyzer.language) || [];
    existing.push(analyzer);
    this.analyzers.set(analyzer.language, existing);
    logger.info(`Registered ${analyzer.toolName} analyzer for ${analyzer.language}`);
  }

  /**
   * Analyze code artifact using all available analyzers for its language
   * @param artifact Code artifact to analyze
   * @param workspacePath Path to temporary workspace
   * @param policies Optional policy rules to check against
   * @returns Analysis result with all violations
   */
  async analyzeCode(
    artifact: Artifact,
    workspacePath: string,
    policies?: PolicyRule[]
  ): Promise<StaticAnalysisResult> {
    const startTime = Date.now();
    const language = this.detectLanguage(artifact);

    if (!language) {
      logger.warn('Could not detect language for artifact, skipping static analysis');
      return this.getEmptyResult();
    }

    logger.info(`Analyzing ${language} code with static analysis tools`);

    const analyzers = this.analyzers.get(language) || [];

    if (analyzers.length === 0) {
      logger.warn(`No static analyzers registered for language: ${language}`);
      return this.getEmptyResult();
    }

    // Run all analyzers for this language
    const allViolations: StaticAnalysisViolation[] = [];
    let hasFailures = false;

    for (const analyzer of analyzers) {
      const analyzerStartTime = Date.now();

      try {
        const available = await analyzer.isAvailable();
        if (!available) {
          logger.warn(`Analyzer ${analyzer.toolName} not available, skipping`);
          continue;
        }

        logger.info(`Running ${analyzer.toolName} analyzer`);
        const violations = await analyzer.analyze(artifact, workspacePath);
        allViolations.push(...violations);

        logger.info(`${analyzer.toolName} found ${violations.length} violations`);

        // Record successful static analysis metrics
        const duration = (Date.now() - analyzerStartTime) / 1000;
        metricsService.recordStaticAnalysis(
          analyzer.toolName,
          language,
          duration,
          violations.map(v => ({ severity: v.severity })),
          true
        );
      } catch (error: any) {
        logger.error(`${analyzer.toolName} analysis failed: ${error.message}`);
        hasFailures = true;

        // Record failed static analysis metrics
        const duration = (Date.now() - analyzerStartTime) / 1000;
        metricsService.recordStaticAnalysis(
          analyzer.toolName,
          language,
          duration,
          [],
          false,
          error.message
        );
        // Continue with other analyzers
      }
    }

    // Filter violations based on policies if provided
    const filteredViolations = policies
      ? this.filterByPolicies(allViolations, policies)
      : allViolations;

    // Count violations by severity
    const counts = this.countBySeverity(filteredViolations);

    return {
      violations: filteredViolations,
      total_violations: filteredViolations.length,
      critical_count: counts.critical,
      high_count: counts.high,
      medium_count: counts.medium,
      low_count: counts.low,
    };
  }

  /**
   * Convert static analysis violations to defects for review system
   * @param result Static analysis result
   * @returns Array of defects
   */
  mapViolationsToDefects(result: StaticAnalysisResult): Defect[] {
    return result.violations.map(violation => ({
      severity: this.mapSeverityToDefectLevel(violation.severity),
      category: 'static_analysis',
      location: violation.location,
      description: `[${violation.rule_id}] ${violation.message}`,
      suggested_fix: violation.suggested_fix,
    }));
  }

  /**
   * Detect programming language from artifact metadata or content
   */
  private detectLanguage(artifact: Artifact): string | undefined {
    // Check metadata first
    if (artifact.metadata?.language) {
      return artifact.metadata.language.toLowerCase();
    }

    // Check filename extension
    if (artifact.metadata?.filename) {
      const ext = artifact.metadata.filename.split('.').pop()?.toLowerCase();
      const extensionMap: Record<string, string> = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'go': 'go',
        'rs': 'rust',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
      };
      return extensionMap[ext || ''];
    }

    // Fallback: try to detect from content patterns
    const content = artifact.content || '';

    if (content.includes('def ') || content.includes('import ')) {
      return 'python';
    }
    if (content.includes('function ') || content.includes('const ') || content.includes('let ')) {
      return 'javascript';
    }
    if (content.includes('func ') && content.includes('package ')) {
      return 'go';
    }
    if (content.includes('fn ') && content.includes('impl ')) {
      return 'rust';
    }

    return undefined;
  }

  /**
   * Filter violations based on policy rules
   */
  private filterByPolicies(
    violations: StaticAnalysisViolation[],
    policies: PolicyRule[]
  ): StaticAnalysisViolation[] {
    if (policies.length === 0) {
      return violations;
    }

    // Create a set of rule IDs from policies
    const policyRuleIds = new Set(policies.map(p => p.id));

    // Only include violations that match a policy
    return violations.filter(v => policyRuleIds.has(v.rule_id));
  }

  /**
   * Count violations by severity level
   */
  private countBySeverity(violations: StaticAnalysisViolation[]): {
    critical: number;
    high: number;
    medium: number;
    low: number;
  } {
    return violations.reduce(
      (counts, v) => {
        counts[v.severity]++;
        return counts;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );
  }

  /**
   * Map static analysis severity to defect severity
   */
  private mapSeverityToDefectLevel(
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): 'info' | 'minor' | 'major' | 'critical' {
    const map: Record<string, 'info' | 'minor' | 'major' | 'critical'> = {
      'low': 'info',
      'medium': 'minor',
      'high': 'major',
      'critical': 'critical',
    };
    return map[severity] || 'minor';
  }

  /**
   * Get empty result
   */
  private getEmptyResult(): StaticAnalysisResult {
    return {
      violations: [],
      total_violations: 0,
      critical_count: 0,
      high_count: 0,
      medium_count: 0,
      low_count: 0,
    };
  }

  /**
   * Get list of registered analyzers by language
   */
  getRegisteredAnalyzers(): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const [language, analyzers] of this.analyzers.entries()) {
      result.set(language, analyzers.map(a => a.toolName));
    }

    return result;
  }
}

// Export singleton instance
export const staticAnalysisService = new StaticAnalysisService();
