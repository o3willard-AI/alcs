/**
 * Unit Tests for Coverage Parser
 */

import * as fs from 'fs/promises';
import { CoverageParser } from '../../src/services/coverageParser';

jest.mock('fs/promises');
jest.mock('../../src/services/loggerService');

describe('CoverageParser', () => {
  let parser: CoverageParser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new CoverageParser();
  });

  describe('parsePytestCoverage', () => {
    it('should parse pytest coverage.json', async () => {
      const mockCoverageData = {
        totals: {
          percent_covered: 85.5,
          covered_lines: 85,
          num_statements: 100,
        },
        files: {
          'test.py': {
            missing_lines: [10, 15, 20],
          },
        },
      };

      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockCoverageData));

      const result = await parser.parsePytestCoverage('/path/to/coverage.json');

      expect(result.line_coverage).toBe(85.5);
      expect(result.lines_covered).toBe(85);
      expect(result.lines_total).toBe(100);
      expect(result.uncovered_lines).toEqual([10, 15, 20]);
    });

    it('should return zero coverage on parse error', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await parser.parsePytestCoverage('/path/to/coverage.json');

      expect(result.line_coverage).toBe(0);
      expect(result.lines_total).toBe(0);
    });

    it('should handle missing totals', async () => {
      const mockCoverageData = { files: {} };

      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockCoverageData));

      const result = await parser.parsePytestCoverage('/path/to/coverage.json');

      expect(result.line_coverage).toBe(0);
      expect(result.lines_covered).toBe(0);
    });
  });

  describe('parseJestCoverage', () => {
    it('should parse Jest coverage from total summary', () => {
      const mockCoverageData = {
        total: {
          lines: { total: 100, covered: 90, pct: 90 },
          branches: { total: 50, covered: 40, pct: 80 },
          functions: { total: 20, covered: 18, pct: 90 },
        },
      };

      const result = parser.parseJestCoverage(mockCoverageData);

      expect(result.line_coverage).toBe(90);
      expect(result.branch_coverage).toBe(80);
      expect(result.function_coverage).toBe(90);
      expect(result.lines_covered).toBe(90);
      expect(result.lines_total).toBe(100);
    });

    it('should parse Jest coverage from coverageMap', () => {
      const mockCoverageData = {
        coverageMap: {
          'file1.js': {
            lines: { total: 50, covered: 45 },
            branches: { total: 20, covered: 18 },
            functions: { total: 10, covered: 9 },
          },
          'file2.js': {
            lines: { total: 50, covered: 45 },
            branches: { total: 30, covered: 27 },
            functions: { total: 10, covered: 9 },
          },
        },
      };

      const result = parser.parseJestCoverage(mockCoverageData);

      expect(result.line_coverage).toBe(90); // (45+45)/(50+50) * 100
      expect(result.branch_coverage).toBe(90); // (18+27)/(20+30) * 100
      expect(result.function_coverage).toBe(90); // (9+9)/(10+10) * 100
    });

    it('should return zero coverage on parse error', () => {
      const result = parser.parseJestCoverage(null);

      expect(result.line_coverage).toBe(0);
      expect(result.lines_total).toBe(0);
    });
  });

  describe('parseGoCoverage', () => {
    it('should parse Go coverage output', async () => {
      const mockOutput = 'coverage: 85.5% of statements';

      const result = await parser.parseGoCoverage(mockOutput);

      expect(result.line_coverage).toBe(85.5);
      expect(result.branch_coverage).toBe(85.5); // Go doesn't separate
      expect(result.function_coverage).toBe(85.5);
    });

    it('should return zero coverage if no match found', async () => {
      const mockOutput = 'no coverage info';

      const result = await parser.parseGoCoverage(mockOutput);

      expect(result.line_coverage).toBe(0);
    });

    it('should parse decimal percentages', async () => {
      const mockOutput = 'coverage: 92.3% of statements';

      const result = await parser.parseGoCoverage(mockOutput);

      expect(result.line_coverage).toBe(92.3);
    });
  });

  describe('parseGoCoverageProfile', () => {
    it('should parse Go coverage profile file', async () => {
      const mockProfile = `mode: set
file.go:10.2,12.16 2 1
file.go:15.2,17.10 3 0
file.go:20.1,22.5 2 1`;

      (fs.readFile as jest.Mock).mockResolvedValue(mockProfile);

      const result = await parser.parseGoCoverageProfile('/path/to/coverage.out');

      // 2+2 covered out of 2+3+2 total = 4/7 = 57.14%
      expect(result.line_coverage).toBeCloseTo(57.14, 1);
      expect(result.lines_covered).toBe(4);
      expect(result.lines_total).toBe(7);
    });

    it('should return zero coverage on parse error', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await parser.parseGoCoverageProfile('/path/to/coverage.out');

      expect(result.line_coverage).toBe(0);
    });
  });

  describe('parseJacocoCoverage', () => {
    it('should parse JaCoCo XML coverage', async () => {
      const mockXml = `
        <report>
          <counter type="LINE" missed="10" covered="90"/>
          <counter type="BRANCH" missed="5" covered="45"/>
          <counter type="METHOD" missed="2" covered="18"/>
        </report>
      `;

      (fs.readFile as jest.Mock).mockResolvedValue(mockXml);

      const result = await parser.parseJacocoCoverage('/path/to/jacoco.xml');

      expect(result.line_coverage).toBe(90); // 90/(10+90) * 100
      expect(result.branch_coverage).toBe(90); // 45/(5+45) * 100
      expect(result.function_coverage).toBe(90); // 18/(2+18) * 100
      expect(result.lines_covered).toBe(90);
      expect(result.lines_total).toBe(100);
    });

    it('should handle missing counters', async () => {
      const mockXml = `<report></report>`;

      (fs.readFile as jest.Mock).mockResolvedValue(mockXml);

      const result = await parser.parseJacocoCoverage('/path/to/jacoco.xml');

      expect(result.line_coverage).toBe(0);
      expect(result.lines_total).toBe(0);
    });

    it('should return zero coverage on parse error', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await parser.parseJacocoCoverage('/path/to/jacoco.xml');

      expect(result.line_coverage).toBe(0);
    });
  });
});
