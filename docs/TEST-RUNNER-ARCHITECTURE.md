# Test Runner Architecture

## Overview

The Test Runner Service is responsible for executing real test suites against generated code in a safe, isolated environment. This document outlines the architecture for sandboxed test execution, supporting multiple languages and frameworks while maintaining security and performance.

## Design Goals

1. **Security**: Execute untrusted code without compromising the host system
2. **Multi-framework**: Support 8+ test frameworks (pytest, Jest, JUnit, Go test, etc.)
3. **Performance**: Complete test execution within 5 minutes
4. **Reliability**: Handle test failures, timeouts, and resource exhaustion gracefully
5. **Observability**: Provide detailed test results, coverage metrics, and failure diagnostics

## Architecture Components

### 1. Test Runner Service (Core)

**File**: `src/services/testRunnerService.ts`

```typescript
export interface TestExecutionResult {
  success: boolean;
  passed_tests: number;
  failed_tests: number;
  total_tests: number;
  coverage_percentage: number;
  duration_ms: number;
  failures: TestFailure[];
  stdout: string;
  stderr: string;
}

export interface TestFailure {
  test_name: string;
  error_message: string;
  stack_trace: string;
  location: string; // file:line
}

export class TestRunnerService {
  async executeTests(
    codeArtifact: Artifact,
    testArtifact: Artifact,
    framework: TestFramework,
    options?: TestExecutionOptions
  ): Promise<TestExecutionResult>
}
```

**Responsibilities**:
- Orchestrate test execution flow
- Select appropriate test runner based on framework
- Manage temporary file lifecycle
- Enforce timeouts and resource limits
- Parse and normalize test results
- Convert test failures to Defect objects

### 2. Sandbox Service

**File**: `src/services/sandboxService.ts`

The sandbox service provides isolated execution environments using Docker containers.

#### Sandbox Strategy: Docker Containers

**Why Docker?**
- Strong isolation from host system
- Resource limits (CPU, memory, disk)
- Network isolation (optional)
- Easy cleanup after execution
- Consistent environment across deployments

**Container Configuration**:
```typescript
export interface SandboxConfig {
  image: string;          // Base image (e.g., 'node:20-alpine', 'python:3.11-slim')
  timeout_seconds: number; // Max execution time (default: 300)
  memory_limit_mb: number; // Max memory (default: 512)
  cpu_limit: number;       // CPU shares (default: 1.0)
  network_mode: 'none' | 'bridge'; // Network access (default: 'none')
  readonly_rootfs: boolean; // Read-only root filesystem (default: true)
  tmpfs_size_mb: number;   // Temporary filesystem size (default: 100)
}
```

**Security Measures**:
1. **No network access** by default (network_mode: 'none')
2. **Read-only root filesystem** to prevent system modification
3. **Tmpfs for working directory** - ephemeral, memory-backed storage
4. **User namespaces** - run as non-root inside container
5. **Seccomp profile** - restrict system calls (no mount, no ptrace, etc.)
6. **Resource limits** - prevent resource exhaustion attacks
7. **Timeout enforcement** - kill long-running tests

**Container Lifecycle**:
```
1. Create temporary directory on host
2. Write code and test files to temp directory
3. Start Docker container with volume mount (read-only)
4. Copy files into container tmpfs
5. Execute test command inside container
6. Capture stdout/stderr
7. Copy coverage reports out of container
8. Stop and remove container
9. Clean up temporary directory
```

#### Fallback: Direct Execution (Development Only)

For development/testing without Docker:
- Execute tests in subprocess with limited privileges
- Use OS-level resource limits (ulimit on Linux)
- Execute in isolated temp directory
- **Not recommended for production** due to weaker isolation

### 3. Framework-Specific Runners

Each test framework requires a specific runner implementation.

#### 3.1 PyTest Runner

**File**: `src/services/testRunners/pytestRunner.ts`

```typescript
export class PytestRunner implements TestRunner {
  framework = TestFramework.PYTEST;

  async execute(sandbox: Sandbox, options: RunnerOptions): Promise<TestExecutionResult> {
    // Write code to test_code.py
    // Write tests to test_suite.py
    // Execute: pytest --cov=test_code --cov-report=json --json-report test_suite.py
    // Parse .report.json and coverage.json
  }
}
```

**Command**: `pytest --cov=<module> --cov-report=json --json-report <test_file>`

**Output Parsing**:
- JSON report: `.report.json` - test results
- Coverage report: `coverage.json` - line/branch coverage

#### 3.2 Jest Runner

**File**: `src/services/testRunners/jestRunner.ts`

**Command**: `jest --coverage --json --testPathPattern=<test_file>`

**Output Parsing**:
- JSON output from stdout - test results and coverage

#### 3.3 Go Test Runner

**File**: `src/services/testRunners/goTestRunner.ts`

**Command**: `go test -cover -json ./...`

**Output Parsing**:
- JSONL output - one JSON object per line
- Coverage from `-cover` flag

#### 3.4 JUnit Runner

**File**: `src/services/testRunners/junitRunner.ts`

**Command**: `mvn test -Dmaven.test.failure.ignore=true`

**Output Parsing**:
- JUnit XML reports from `target/surefire-reports/`

#### Framework Detection

The service auto-detects the framework based on:
1. Explicit `framework` parameter in `generate_test_suite`
2. Code artifact metadata (`language` field)
3. Test artifact content patterns (e.g., `describe(` for Jest, `def test_` for pytest)

### 4. Temporary File Management

**File**: `src/services/tempFileManager.ts`

```typescript
export class TempFileManager {
  // Create isolated temp directory
  async createTempWorkspace(): Promise<string>

  // Write artifact content to files
  async writeArtifacts(workspace: string, artifacts: Artifact[]): Promise<void>

  // Clean up temp directory
  async cleanup(workspace: string): Promise<void>

  // Get file path for artifact
  getFilePath(workspace: string, artifact: Artifact): string
}
```

**Directory Structure**:
```
/tmp/alcs-test-<session-id>-<timestamp>/
├── code/
│   ├── main.py           # Code artifact
│   └── utils.py          # Additional files
├── tests/
│   └── test_main.py      # Test artifact
├── reports/
│   ├── coverage.json     # Coverage report
│   └── test-results.json # Test results
└── logs/
    ├── stdout.log
    └── stderr.log
```

**Cleanup Strategy**:
- Immediate cleanup after test execution (success or failure)
- Fallback: Cron job to clean temp directories older than 1 hour
- Store test results in database before cleanup

### 5. Coverage Report Parsing

**File**: `src/services/coverageParser.ts`

Normalize coverage reports from different tools into a unified format.

```typescript
export interface CoverageReport {
  line_coverage: number;      // Percentage (0-100)
  branch_coverage: number;    // Percentage (0-100)
  function_coverage: number;  // Percentage (0-100)
  lines_covered: number;
  lines_total: number;
  uncovered_lines: number[];  // Line numbers
}

export class CoverageParser {
  parsePytestCoverage(jsonPath: string): CoverageReport
  parseJestCoverage(json: any): CoverageReport
  parseGoCoverage(output: string): CoverageReport
  parseJacocoCoverage(xmlPath: string): CoverageReport
}
```

### 6. Test Failure to Defect Mapping

**File**: `src/services/testDefectMapper.ts`

Convert test failures into Defect objects for the review system.

```typescript
export class TestDefectMapper {
  mapFailuresToDefects(result: TestExecutionResult): Defect[] {
    return result.failures.map(failure => ({
      severity: 'high',  // Failed tests are always high severity
      description: `Test failed: ${failure.test_name}`,
      location: failure.location,
      details: {
        error_message: failure.error_message,
        stack_trace: failure.stack_trace
      },
      type: 'test_failure'
    }));
  }
}
```

## Integration with run_critic_review

**Current Flow**:
```
run_critic_review
  ├── Agent Beta semantic review
  ├── Mock test coverage (hardcoded)
  └── Mock policy violations (hardcoded)
```

**New Flow**:
```
run_critic_review
  ├── Agent Beta semantic review
  ├── TestRunnerService.executeTests()  ← NEW
  │   ├── Find test artifact for code artifact
  │   ├── Execute tests in sandbox
  │   ├── Parse coverage report
  │   └── Convert failures to defects
  ├── StaticAnalysisService.analyzeCode()  ← NEW (Task 3.2)
  │   ├── Run ESLint/Pylint/etc.
  │   └── Convert violations to defects
  └── Aggregate all defects + calculate quality score
```

**Refactored Function** (Task 3.3.1):
```typescript
export async function run_critic_review(
  session_id: string,
  params: RunCriticReviewParams
): Promise<RunCriticReviewResponse> {
  const session = await getSessionState(session_id);
  const codeArtifact = findArtifact(session, params.artifact_id);

  // 1. Agent Beta semantic review
  const betaReview = await agentBeta.reviewCode(codeArtifact);

  // 2. Execute real tests if test artifact exists
  let testDefects: Defect[] = [];
  let testCoverage = 0;
  const testArtifact = findTestArtifact(session, codeArtifact.id);
  if (testArtifact) {
    const testResult = await testRunnerService.executeTests(
      codeArtifact,
      testArtifact,
      detectFramework(testArtifact)
    );
    testCoverage = testResult.coverage_percentage;
    testDefects = testDefectMapper.mapFailuresToDefects(testResult);
  }

  // 3. Run static analysis
  const policies = await readPolicies(session_id);
  const staticDefects = await staticAnalysisService.analyzeCode(
    codeArtifact,
    policies
  );

  // 4. Aggregate all defects
  const allDefects = [
    ...betaReview.defects,
    ...testDefects,
    ...staticDefects
  ];

  // 5. Calculate quality score
  const qualityScore = scoringService.calculateScore({
    defects: allDefects,
    testCoverage,
    codeQuality: betaReview.code_quality
  });

  return {
    quality_score: qualityScore,
    defects: allDefects,
    test_coverage_estimate: testCoverage, // Now real, not estimate!
    // ...
  };
}
```

## Security Considerations

### 1. Code Injection Prevention

**Risk**: Generated code could execute malicious commands

**Mitigation**:
- Docker network isolation (no outbound connections)
- Read-only root filesystem
- No volume mounts to sensitive directories
- Seccomp profile restricting system calls

### 2. Resource Exhaustion

**Risk**: Infinite loops, memory bombs, fork bombs

**Mitigation**:
- CPU limits (1 core)
- Memory limits (512 MB)
- Timeout (5 minutes)
- Process limits (pids limit)
- Disk space limits (tmpfs)

### 3. Container Escape

**Risk**: Exploit Docker vulnerability to access host

**Mitigation**:
- Use unprivileged containers
- Drop all Linux capabilities
- User namespaces (rootless Docker)
- Keep Docker daemon updated
- Consider gVisor for enhanced isolation (optional)

### 4. Sensitive Data Leakage

**Risk**: Code contains API keys, passwords

**Mitigation**:
- Scan code artifacts for secrets before execution
- Use dangerousOutputDetector from existing system
- Never log full artifact content

## Performance Optimization

### 1. Container Reuse

**Problem**: Starting fresh containers is slow (2-5 seconds)

**Solution**: Container pooling
- Maintain pool of pre-started containers
- Reset container state between runs (delete tmpfs contents)
- Limit pool size (10 containers max)

### 2. Parallel Test Execution

**Problem**: Running tests sequentially is slow

**Solution**: Execute multiple test suites in parallel
- Use Promise.all() for independent test runs
- Limit concurrency to available CPU cores
- Share container pool across concurrent runs

### 3. Result Caching

**Problem**: Re-running same tests is wasteful

**Solution**: Cache test results by content hash
- Hash: SHA256(code_artifact.content + test_artifact.content)
- Cache in Redis (optional) or in-memory Map
- TTL: 1 hour
- Invalidate on code/test changes

## Error Handling

### 1. Container Startup Failure

**Error**: Docker daemon not running, image not found

**Handling**:
- Return error to user: "Test execution unavailable"
- Log error for ops team
- Fall back to mock coverage (with warning)

### 2. Test Timeout

**Error**: Tests exceed 5-minute limit

**Handling**:
- Kill container
- Return partial results if coverage report generated
- Add defect: "Test execution timed out"

### 3. Test Framework Not Installed

**Error**: pytest not found in container

**Handling**:
- Return error: "Framework X not available"
- Suggest running `scripts/install-analysis-tools.sh`
- Skip test execution, proceed with static analysis only

### 4. Coverage Report Parse Error

**Error**: Malformed JSON, missing file

**Handling**:
- Log warning
- Return 0% coverage (conservative)
- Include raw stdout/stderr for debugging

## Testing Strategy

### Unit Tests

**File**: `tests/services/testRunnerService.test.ts`

- Mock Docker commands (dockerode library)
- Test coverage parsing logic
- Test defect mapping
- Test timeout handling
- Test error scenarios

### Integration Tests

**File**: `tests/integration/testRunner.test.ts`

- Requires Docker daemon running
- Test real pytest execution
- Test real Jest execution
- Test timeout enforcement
- Test resource limits

**Test Data**:
```
tests/fixtures/
├── python-sample/
│   ├── calculator.py
│   └── test_calculator.py
├── javascript-sample/
│   ├── calculator.js
│   └── calculator.test.js
└── go-sample/
    ├── calculator.go
    └── calculator_test.go
```

## Deployment Requirements

### Docker Images

Pre-built images with test frameworks installed:

```dockerfile
# alcs-test-python:latest
FROM python:3.11-slim
RUN pip install pytest pytest-cov

# alcs-test-node:latest
FROM node:20-alpine
RUN npm install -g jest

# alcs-test-go:latest
FROM golang:1.21-alpine

# alcs-test-java:latest
FROM eclipse-temurin:17-jdk-alpine
RUN apk add maven
```

**Build Script**: `scripts/build-test-images.sh`

### Tool Installation

**File**: `scripts/install-analysis-tools.sh`

Installs all test frameworks and static analysis tools:
- pytest, pytest-cov
- jest
- go test (included with Go)
- maven, JUnit 5
- ESLint
- Pylint, Bandit
- golangci-lint
- cargo clippy

## Future Enhancements

### Phase 4+

1. **Parallel Test Sharding**: Split large test suites across multiple containers
2. **Test Result History**: Track flaky tests, performance trends
3. **Smart Test Selection**: Only run tests affected by code changes
4. **GPU Support**: For ML model testing
5. **Browser Testing**: Selenium/Playwright for UI tests
6. **Load Testing**: Performance test execution (JMeter, k6)
7. **Snapshot Testing**: Detect visual regressions

## References

- Docker seccomp profiles: https://docs.docker.com/engine/security/seccomp/
- gVisor sandboxing: https://gvisor.dev/
- Pytest JSON report: https://pypi.org/project/pytest-json-report/
- Jest coverage: https://jestjs.io/docs/configuration#collectcoverage-boolean
- Go test JSON: https://pkg.go.dev/cmd/test2json

---

**Document Version**: 1.0
**Author**: ALCS Development Team
**Last Updated**: 2026-01-02
**Status**: Approved for Implementation
