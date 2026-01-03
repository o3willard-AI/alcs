import { logger } from '../services/loggerService';

export interface DangerousPattern {
  name: string;
  description: string;
  pattern: RegExp;
  severity: 'warning' | 'critical';
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  { name: 'DestructiveFileOps', description: 'Destructive file operations (e.g., rm -rf /)', pattern: /rm\s+-rf\s+[\/~]/i, severity: 'critical' },
  { name: 'SQLDestruction', description: 'SQL destruction (e.g., DROP TABLE/DATABASE)', pattern: /DROP\s+(TABLE|DATABASE)/i, severity: 'critical' },
  { name: 'UnboundedDeletes', description: 'Unbounded SQL deletes', pattern: /DELETE\s+FROM\s+\w+\s*;/i, severity: 'critical' },
  { name: 'InfiniteWhileLoop', description: 'Obvious infinite while loops', pattern: /while\s*\(\s*true\s*\)/, severity: 'warning' },
  { name: 'InfiniteForLoop', description: 'Obvious infinite for loops', pattern: /for\s*\(\s*;\s*;\s*\)/, severity: 'warning' },
  { name: 'DynamicCodeExecution', description: 'Dynamic code execution (e.g., exec(), eval())', pattern: /(exec|eval)\s*\(/, severity: 'critical' },
  { name: 'ShellInjectionRisk', description: 'Shell injection risk in Python subprocess', pattern: /subprocess\.call.*shell=True/, severity: 'critical' },
];

export interface DangerousOutputReport {
  is_dangerous: boolean;
  patterns_matched: DangerousPattern[];
}

/**
 * Scans a string of code for potentially dangerous patterns.
 * @param code The code to scan.
 * @returns A report detailing any dangerous patterns found.
 */
export function detectDangerousOutput(code: string): DangerousOutputReport {
  const patterns_matched: DangerousPattern[] = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.pattern.test(code)) {
      patterns_matched.push(pattern);
      logger.warn(`Dangerous output detected: ${pattern.name} - ${pattern.description}`);
    }
  }

  return {
    is_dangerous: patterns_matched.length > 0,
    patterns_matched,
  };
}
