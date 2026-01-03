/**
 * JUnit Test Runner
 *
 * Executes Java tests using Maven with JUnit 5.
 * Parses JUnit XML reports and JaCoCo coverage.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { TestRunner } from '../testRunnerService';
import { TestFramework, TestExecutionResult, TestExecutionOptions, TestFailure } from '../../types/mcp';
import { logger } from '../loggerService';
import { coverageParser } from '../coverageParser';

const execFileAsync = promisify(execFile);

export class JUnitRunner implements TestRunner {
  framework: TestFramework = 'junit5';

  async execute(
    workspacePath: string,
    codeFilePath: string,
    testFilePath: string,
    options: TestExecutionOptions
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();

    logger.info(`Executing JUnit tests from ${testFilePath}`);

    try {
      // Check if pom.xml exists
      const pomPath = path.join(workspacePath, 'pom.xml');
      const hasPom = await this.fileExists(pomPath);

      if (!hasPom) {
        // Create minimal pom.xml if it doesn't exist
        await this.createMinimalPom(workspacePath);
      }

      // Build maven command
      const args = [
        'test',
        '-Dmaven.test.failure.ignore=true', // Don't fail build on test failures
        '-Djacoco.skip=false', // Enable JaCoCo coverage
      ];

      // Execute maven test
      const result = await this.executeMaven(workspacePath, args, options);

      // Parse JUnit XML reports
      const surefireReportsDir = path.join(workspacePath, 'target', 'surefire-reports');
      const testResults = await this.parseJUnitXmlReports(surefireReportsDir);

      // Parse JaCoCo coverage
      const jacocoXmlPath = path.join(workspacePath, 'target', 'site', 'jacoco', 'jacoco.xml');
      let coverageReport;
      try {
        await fs.access(jacocoXmlPath);
        coverageReport = await coverageParser.parseJacocoCoverage(jacocoXmlPath);
      } catch {
        logger.warn('JaCoCo coverage report not found');
        coverageReport = {
          line_coverage: 0,
          branch_coverage: 0,
          function_coverage: 0,
          lines_covered: 0,
          lines_total: 0,
          uncovered_lines: [],
        };
      }

      return {
        success: testResults.failed === 0,
        passed_tests: testResults.passed,
        failed_tests: testResults.failed,
        total_tests: testResults.total,
        coverage_percentage: coverageReport.line_coverage,
        duration_ms: Date.now() - startTime,
        failures: testResults.failures,
        stdout: result.stdout,
        stderr: result.stderr,
      };

    } catch (error: any) {
      logger.error(`JUnit test execution failed: ${error.message}`);

      return {
        success: false,
        passed_tests: 0,
        failed_tests: 0,
        total_tests: 0,
        coverage_percentage: 0,
        duration_ms: Date.now() - startTime,
        failures: [{
          test_name: 'junit_execution',
          error_message: error.message,
          stack_trace: error.stack || '',
          location: 'unknown',
        }],
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
      };
    }
  }

  /**
   * Execute maven command with timeout
   */
  private async executeMaven(
    workspacePath: string,
    args: string[],
    options: TestExecutionOptions
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const timeoutMs = (options.timeout_seconds || 300) * 1000;

    try {
      const { stdout, stderr } = await execFileAsync('mvn', args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          MAVEN_OPTS: '-Xmx512m', // Limit Maven memory
        },
      });

      return {
        exitCode: 0,
        stdout,
        stderr,
      };

    } catch (error: any) {
      // Maven may return non-zero even with -Dmaven.test.failure.ignore=true in some cases
      // Return the output for parsing
      return {
        exitCode: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  }

  /**
   * Parse JUnit XML reports from target/surefire-reports
   */
  private async parseJUnitXmlReports(reportsDir: string): Promise<{
    passed: number;
    failed: number;
    total: number;
    failures: TestFailure[];
  }> {
    const failures: TestFailure[] = [];
    let passed = 0;
    let failed = 0;
    let total = 0;

    try {
      const files = await fs.readdir(reportsDir);
      const xmlFiles = files.filter(f => f.endsWith('.xml') && f.startsWith('TEST-'));

      for (const xmlFile of xmlFiles) {
        const xmlPath = path.join(reportsDir, xmlFile);
        const xmlContent = await fs.readFile(xmlPath, 'utf-8');

        // Parse XML for test results
        const testsuiteMatch = xmlContent.match(/<testsuite[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"/);

        if (testsuiteMatch) {
          const tests = parseInt(testsuiteMatch[1], 10);
          const testFailures = parseInt(testsuiteMatch[2], 10);
          const errors = parseInt(testsuiteMatch[3], 10);

          total += tests;
          failed += testFailures + errors;
          passed += tests - testFailures - errors;
        }

        // Extract failure details
        const testcaseMatches = xmlContent.matchAll(/<testcase[^>]*name="([^"]+)"[^>]*classname="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/g);

        for (const testcaseMatch of testcaseMatches) {
          const testName = testcaseMatch[1];
          const className = testcaseMatch[2];
          const testcaseContent = testcaseMatch[3];

          // Check for failures or errors
          const failureMatch = testcaseContent.match(/<failure[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/failure>/);
          const errorMatch = testcaseContent.match(/<error[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/error>/);

          if (failureMatch || errorMatch) {
            const match = failureMatch || errorMatch;
            const errorMessage = match![1] || 'Test failed';
            const stackTrace = match![2] || '';

            failures.push({
              test_name: `${className}.${testName}`,
              error_message: this.decodeXmlEntities(errorMessage),
              stack_trace: this.decodeXmlEntities(stackTrace),
              location: className,
            });
          }
        }
      }
    } catch (error: any) {
      logger.error(`Failed to parse JUnit XML reports: ${error.message}`);
    }

    return {
      passed,
      failed,
      total,
      failures,
    };
  }

  /**
   * Decode XML entities
   */
  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create minimal pom.xml for standalone test execution
   */
  private async createMinimalPom(workspacePath: string): Promise<void> {
    const pomContent = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.alcs.generated</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <junit.version>5.9.3</junit.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>\${junit.version}</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.0.0</version>
            </plugin>
            <plugin>
                <groupId>org.jacoco</groupId>
                <artifactId>jacoco-maven-plugin</artifactId>
                <version>0.8.10</version>
                <executions>
                    <execution>
                        <goals>
                            <goal>prepare-agent</goal>
                        </goals>
                    </execution>
                    <execution>
                        <id>report</id>
                        <phase>test</phase>
                        <goals>
                            <goal>report</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>`;

    const pomPath = path.join(workspacePath, 'pom.xml');
    await fs.writeFile(pomPath, pomContent, 'utf-8');
    logger.info('Created minimal pom.xml for test execution');
  }

  /**
   * Check if maven is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('mvn', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}
