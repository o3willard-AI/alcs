/**
 * Bandit Analyzer
 *
 * Security-focused static analysis for Python using Bandit.
 * Detects security vulnerabilities and dangerous code patterns.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { StaticAnalyzer } from '../staticAnalysisService';
import { Artifact, StaticAnalysisViolation } from '../../types/mcp';
import { logger } from '../loggerService';
import { tempFileManager } from '../tempFileManager';

const execFileAsync = promisify(execFile);

export class BanditAnalyzer implements StaticAnalyzer {
  language = 'python';
  toolName = 'bandit';

  async analyze(
    artifact: Artifact,
    workspacePath: string
  ): Promise<StaticAnalysisViolation[]> {
    try {
      // Write artifact to file
      const filePath = await tempFileManager.writeArtifact(workspacePath, artifact);

      // Run Bandit with JSON output
      const args = [
        '-f', 'json',
        filePath,
      ];

      // Execute Bandit
      const result = await this.executeBandit(workspacePath, args);

      // Parse JSON output
      return this.parseBanditOutput(result.stdout, path.basename(filePath));

    } catch (error: any) {
      logger.error(`Bandit analysis failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute Bandit command
   */
  private async executeBandit(
    workspacePath: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync('bandit', args, {
        cwd: workspacePath,
        timeout: 60000, // 1 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      return { stdout, stderr };

    } catch (error: any) {
      // Bandit returns non-zero exit code when issues are found
      // This is expected, so return the output
      if (error.stdout) {
        return {
          stdout: error.stdout,
          stderr: error.stderr || '',
        };
      }

      throw error;
    }
  }

  /**
   * Parse Bandit JSON output
   */
  private parseBanditOutput(
    stdout: string,
    fileName: string
  ): StaticAnalysisViolation[] {
    const violations: StaticAnalysisViolation[] = [];

    try {
      const result = JSON.parse(stdout);

      // Bandit returns results in a 'results' array
      const results = result.results || [];

      for (const issue of results) {
        violations.push({
          rule_id: issue.test_id || issue.test_name,
          severity: this.mapSeverity(issue.issue_severity),
          message: `${issue.issue_text}. Confidence: ${issue.issue_confidence}`,
          location: `${fileName}:${issue.line_number}`,
          line: issue.line_number,
          column: 0, // Bandit doesn't provide column
          suggested_fix: this.getSuggestedFix(issue.test_id),
        });
      }
    } catch (error: any) {
      logger.error(`Failed to parse Bandit output: ${error.message}`);
    }

    return violations;
  }

  /**
   * Map Bandit severity to our severity levels
   */
  private mapSeverity(banditSeverity: string): 'low' | 'medium' | 'high' | 'critical' {
    // Bandit severity: LOW, MEDIUM, HIGH
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'LOW': 'low',
      'MEDIUM': 'medium',
      'HIGH': 'high',
      'UNDEFINED': 'low',
    };

    return severityMap[banditSeverity.toUpperCase()] || 'medium';
  }

  /**
   * Get suggested fix for common security issues
   */
  private getSuggestedFix(testId: string): string | undefined {
    const fixes: Record<string, string> = {
      'B201': 'Use pickle.loads() with trusted data only',
      'B301': 'Use pickle with caution; prefer JSON for serialization',
      'B303': 'Use cryptographically secure random with secrets module',
      'B304': 'Use secrets module instead of random for security-sensitive operations',
      'B305': 'Use secure cipher modes; avoid ECB mode',
      'B306': 'Avoid using mktemp; use mkstemp instead',
      'B307': 'Use safe_load() instead of load() for YAML',
      'B308': 'Validate user input before using in shell commands',
      'B309': 'Use subprocess with shell=False',
      'B310': 'Validate URLs before making requests',
      'B311': 'Use secrets.SystemRandom() for cryptographic randomness',
      'B312': 'Use safer XML parsing libraries',
      'B313': 'Avoid XML entities; use defusedxml',
      'B314': 'Avoid using ElementTree without protection against billion laughs',
      'B315': 'Avoid using ElementTree without protection against quadratic blowup',
      'B316': 'Use defusedxml for XML parsing',
      'B317': 'Avoid using pickle for deserialization',
      'B318': 'Avoid using input() in Python 2',
      'B319': 'Use defusedxml for XML parsing',
      'B320': 'Avoid XML external entity attacks',
      'B321': 'Use ftplib with caution',
      'B322': 'Use secrets module for generating tokens',
      'B323': 'Avoid unverified SSL/TLS contexts',
      'B324': 'Use strong cryptographic hashes (SHA256+)',
      'B325': 'Avoid tempfile.mktemp',
      'B401': 'Avoid using telnetlib',
      'B402': 'Use secure FTP alternatives',
      'B403': 'Avoid using pickle',
      'B404': 'Use subprocess instead of os.popen',
      'B405': 'Avoid using os.system',
      'B406': 'Use subprocess instead of shell commands',
      'B407': 'Use defusedxml for XML parsing',
      'B408': 'Use safer alternatives to eval()',
      'B409': 'Use safer alternatives to exec()',
      'B410': 'Avoid using urllib with file:// URLs',
      'B411': 'Avoid using configparser without safe defaults',
      'B412': 'Use secrets module for cryptographic operations',
      'B413': 'Use secrets module for encryption',
      'B501': 'Use certificate verification in requests',
      'B502': 'Use strict SSL/TLS settings',
      'B503': 'Use secure SSL/TLS versions',
      'B504': 'Use secure SSL/TLS configuration',
      'B505': 'Use cryptographically secure algorithms',
      'B506': 'Avoid YAML unsafe loading',
      'B507': 'Use secure SSH configuration',
      'B601': 'Avoid shell injection vulnerabilities',
      'B602': 'Use subprocess with shell=False',
      'B603': 'Validate subprocess calls',
      'B604': 'Use subprocess securely',
      'B605': 'Validate shell commands',
      'B606': 'Avoid shell=True in subprocess',
      'B607': 'Validate PATH before executing',
      'B608': 'Avoid SQL injection',
      'B609': 'Avoid Linux command injection',
      'B610': 'Use parameterized queries',
      'B611': 'Avoid SQL injection in Django',
      'B701': 'Use cryptographically secure random',
      'B702': 'Use safe HTTP clients',
      'B703': 'Use Django secure settings',
    };

    return fixes[testId];
  }

  /**
   * Check if Bandit is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('bandit', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}
