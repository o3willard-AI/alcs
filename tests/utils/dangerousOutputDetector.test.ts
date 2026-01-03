import { detectDangerousOutput, DangerousOutputReport } from '../../src/utils/dangerousOutputDetector';
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

describe('detectDangerousOutput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return is_dangerous: false for safe code', () => {
    const safeCode = `
      function safeFunction() {
        console.log("This is safe.");
      }
    `;
    const report = detectDangerousOutput(safeCode);
    expect(report.is_dangerous).toBe(false);
    expect(report.patterns_matched).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  const dangerousTestCases = [
    { name: 'DestructiveFileOps', code: 'os.system("rm -rf /")' },
    { name: 'SQLDestruction', code: 'cursor.execute("DROP TABLE users")' },
    { name: 'UnboundedDeletes', code: 'db.query("DELETE FROM logs;")' },
    { name: 'InfiniteWhileLoop', code: 'while(true) { console.log("loop"); }' },
    { name: 'InfiniteForLoop', code: 'for(;;) { break; }' },
    { name: 'DynamicCodeExecution', code: 'eval("console.log(\'danger\')")' },
    { name: 'ShellInjectionRisk', code: 'subprocess.call("ls -l", shell=True)' },
  ];

  dangerousTestCases.forEach(({ name, code }) => {
    it(`should detect the ${name} pattern`, () => {
      const report = detectDangerousOutput(code);
      expect(report.is_dangerous).toBe(true);
      expect(report.patterns_matched).toHaveLength(1);
      expect(report.patterns_matched[0].name).toBe(name);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Dangerous output detected: ${name}`));
    });
  });

  it('should detect multiple dangerous patterns', () => {
    const multiDangerCode = `
      // This code is very dangerous
      eval("DROP DATABASE production;");
      while(true) {}
    `;
    const report = detectDangerousOutput(multiDangerCode);
    expect(report.is_dangerous).toBe(true);
    expect(report.patterns_matched).toHaveLength(3); // eval, DROP DATABASE, while(true)
    expect(report.patterns_matched.some(p => p.name === 'DynamicCodeExecution')).toBe(true);
    expect(report.patterns_matched.some(p => p.name === 'SQLDestruction')).toBe(true);
    expect(report.patterns_matched.some(p => p.name === 'InfiniteWhileLoop')).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });
});
