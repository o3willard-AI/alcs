/**
 * ESLint Analyzer
 *
 * Static analysis for JavaScript and TypeScript using ESLint.
 * Detects code quality issues, style violations, and potential bugs.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StaticAnalyzer } from '../staticAnalysisService';
import { Artifact, StaticAnalysisViolation } from '../../types/mcp';
import { logger } from '../loggerService';
import { tempFileManager } from '../tempFileManager';

const execFileAsync = promisify(execFile);

export class ESLintAnalyzer implements StaticAnalyzer {
  language = 'javascript'; // Also handles TypeScript
  toolName = 'eslint';

  async analyze(
    artifact: Artifact,
    workspacePath: string
  ): Promise<StaticAnalysisViolation[]> {
    try {
      // Write artifact to file
      const filePath = await tempFileManager.writeArtifact(workspacePath, artifact);

      // Run ESLint with JSON output
      const args = [
        filePath,
        '--format=json',
        '--no-eslintrc', // Don't use external config
        '--no-ignore', // Analyze even ignored files
      ];

      // Execute ESLint
      const result = await this.executeESLint(workspacePath, args);

      // Parse JSON output
      return this.parseESLintOutput(result.stdout, path.basename(filePath));

    } catch (error: any) {
      logger.error(`ESLint analysis failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute ESLint command
   */
  private async executeESLint(
    workspacePath: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      // Try npx eslint first
      const { stdout, stderr } = await execFileAsync('npx', ['eslint', ...args], {
        cwd: workspacePath,
        timeout: 60000, // 1 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      return { stdout, stderr };

    } catch (error: any) {
      // ESLint returns non-zero exit code when violations are found
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
   * Parse ESLint JSON output
   */
  private parseESLintOutput(
    stdout: string,
    fileName: string
  ): StaticAnalysisViolation[] {
    const violations: StaticAnalysisViolation[] = [];

    try {
      const results = JSON.parse(stdout);

      // ESLint returns an array of file results
      for (const fileResult of results) {
        for (const message of fileResult.messages) {
          violations.push({
            rule_id: message.ruleId || 'unknown',
            severity: this.mapSeverity(message.severity),
            message: message.message,
            location: `${fileName}:${message.line}:${message.column}`,
            line: message.line,
            column: message.column,
            suggested_fix: message.fix ? this.formatFix(message.fix) : undefined,
          });
        }
      }
    } catch (error: any) {
      logger.error(`Failed to parse ESLint output: ${error.message}`);
    }

    return violations;
  }

  /**
   * Map ESLint severity to our severity levels
   */
  private mapSeverity(eslintSeverity: number): 'low' | 'medium' | 'high' | 'critical' {
    // ESLint severity: 0 = off, 1 = warn, 2 = error
    switch (eslintSeverity) {
      case 2:
        return 'high';
      case 1:
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Format fix suggestion
   */
  private formatFix(fix: any): string {
    if (fix.text) {
      return `Replace with: ${fix.text}`;
    }
    return 'Auto-fixable';
  }

  /**
   * Check if ESLint is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('npx', ['eslint', '--version']);
      return true;
    } catch {
      return false;
    }
  }
}
