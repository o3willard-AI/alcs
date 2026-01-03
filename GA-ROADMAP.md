# ALCS GA Roadmap - Production Readiness Plan

## Executive Summary

This document outlines the phased approach to bring the Dual-Agent Local Coding Service (ALCS) from its current functional state to General Availability (GA) production readiness.

**Current State:** Functionally complete with working core logic, but missing MCP server exposure, persistent storage, and real tool integrations.

**GA Definition:** Production-ready system that can be deployed globally, exposing MCP tools to any MCP-compatible client, with persistent storage, real test execution, comprehensive monitoring, and enterprise-grade reliability.

**Estimated Timeline:** 8-12 weeks (solo developer)
**Estimated Effort:** ~280-320 hours

---

## Phase 0: Stabilization (Week 1 - 16 hours)

**Goal:** Fix existing test failures and establish stable baseline

### Critical Issues
All failing tests are due to Jest mocking issues, not logic errors. These must be resolved first.

#### Task 0.1: Fix readOrgPolicies Tests (3 hours)
- **File:** `tests/tools/readOrgPolicies.test.ts`
- **Issue:** `configManager.config` is undefined in test context
- **Fix Strategy:** Proper mocking of configManager singleton before import
- **Acceptance:** All 5 tests pass
- **Test Command:** `npm test -- tests/tools/readOrgPolicies.test.ts`

#### Task 0.2: Fix loggerService Tests (3 hours)
- **File:** `tests/services/loggerService.test.ts`
- **Issue:** DailyRotateFile transport constructor not being called
- **Fix Strategy:** Refactor mocking to properly intercept constructor calls
- **Acceptance:** All 3 tests pass
- **Test Command:** `npm test -- tests/services/loggerService.test.ts`

#### Task 0.3: Fix concurrencyLimiter Tests (2 hours)
- **File:** `tests/utils/concurrencyLimiter.test.ts`
- **Issue:** Timer-based test race conditions
- **Fix Strategy:** Proper use of jest.useFakeTimers() and jest.runAllTimers()
- **Acceptance:** All 4 tests pass
- **Test Command:** `npm test -- tests/utils/concurrencyLimiter.test.ts`

#### Task 0.4: Fix retryHandler Tests (3 hours)
- **File:** `tests/utils/retryHandler.test.ts`
- **Issue:** Timing and exponential backoff validation
- **Fix Strategy:** Mock Date.now() and validate retry intervals
- **Acceptance:** All 5 tests pass
- **Test Command:** `npm test -- tests/utils/retryHandler.test.ts`

#### Task 0.5: Fix runCriticReview Tests (3 hours)
- **File:** `tests/tools/runCriticReview.test.ts`
- **Issue:** Complex mocking of multiple services
- **Fix Strategy:** Isolate mocks for sessionManager, agentBeta, scoringService
- **Acceptance:** All 6 tests pass
- **Test Command:** `npm test -- tests/tools/runCriticReview.test.ts`

#### Task 0.6: Verify Full Test Suite (2 hours)
- **Action:** Run complete test suite and verify 100% pass rate
- **Acceptance:** `npm test` shows all tests passing
- **Deliverable:** Clean test report screenshot/log

---

## Phase 1: MCP Server Integration (Weeks 2-3 - 50 hours)

**Goal:** Expose all implemented tools via official MCP protocol using TypeScript SDK

### Task 1.1: MCP SDK Installation & Setup (4 hours)

#### Task 1.1.1: Install MCP SDK Dependencies
- **Action:** `npm install @modelcontextprotocol/sdk`
- **Verify:** Package appears in package.json
- **Test:** Import works: `import { Server } from '@modelcontextprotocol/sdk/server/index.js';`

#### Task 1.1.2: Create MCP Server Entry Point
- **File:** `src/mcp-server.ts`
- **Content:** Initialize MCP Server with transport
- **Acceptance:** File compiles without errors
- **Test:** `npx tsc --noEmit`

#### Task 1.1.3: Configure Server Metadata
- **Action:** Define server name, version, capabilities
- **Acceptance:** Server info object matches PRD specification
- **Test:** Unit test for server initialization

### Task 1.2: Tool Registration (20 hours)

Each MCP tool must be registered with proper schema and handler mapping.

#### Task 1.2.1: Register execute_task_spec Tool
- **File:** `src/mcp-tools/executeTaskSpecTool.ts`
- **Actions:**
  - Define JSON schema for TaskSpec parameters
  - Wire up to existing `execute_task_spec` function
  - Add input validation
- **Acceptance:** Tool callable via MCP protocol
- **Test:** Manual MCP client test + unit test

#### Task 1.2.2: Register run_critic_review Tool
- **File:** `src/mcp-tools/runCriticReviewTool.ts`
- **Acceptance:** Tool callable with artifact_id and review_depth
- **Test:** MCP call returns ReviewFeedback structure

#### Task 1.2.3: Register revise_code Tool
- **File:** `src/mcp-tools/reviseCodeTool.ts`
- **Acceptance:** Tool accepts feedback and returns revised artifact
- **Test:** Integration test with mock Alpha agent

#### Task 1.2.4: Register get_repo_map Tool
- **File:** `src/mcp-tools/getRepoMapTool.ts`
- **Acceptance:** Returns hierarchical file structure with chunking
- **Test:** Test with sample repository structure

#### Task 1.2.5: Register get_project_status Tool
- **File:** `src/mcp-tools/getProjectStatusTool.ts`
- **Acceptance:** Returns current session state
- **Test:** Mock session and verify response

#### Task 1.2.6: Register read_org_policies Tool
- **File:** `src/mcp-tools/readOrgPoliciesTool.ts`
- **Acceptance:** Returns policy rules by type
- **Test:** Test with custom and default policies

#### Task 1.2.7: Register configure_endpoint Tool
- **File:** `src/mcp-tools/configureEndpointTool.ts`
- **Acceptance:** Swaps agent endpoints at runtime
- **Test:** Verify health check after swap

#### Task 1.2.8: Register set_system_prompts Tool
- **File:** `src/mcp-tools/setSystemPromptsTool.ts`
- **Acceptance:** Updates agent prompts dynamically
- **Test:** Verify prompt persistence

#### Task 1.2.9: Register get_progress_summary Tool
- **File:** `src/mcp-tools/getProgressSummaryTool.ts`
- **Acceptance:** Returns iteration metrics
- **Test:** Mock session with multiple iterations

#### Task 1.2.10: Register final_handoff_archive Tool
- **File:** `src/mcp-tools/finalHandoffArchiveTool.ts`
- **Acceptance:** Returns complete archive with audit trail
- **Test:** Verify all artifacts included

#### Task 1.2.11: Register generate_test_suite Tool
- **File:** `src/mcp-tools/generateTestSuiteTool.ts`
- **Acceptance:** Generates framework-specific tests
- **Test:** Test for pytest, Jest, JUnit frameworks

#### Task 1.2.12: Register inject_alternative_pattern Tool
- **File:** `src/mcp-tools/injectAlternativePatternTool.ts`
- **Acceptance:** Injects code pattern to Alpha
- **Test:** Verify pattern injection in revision

### Task 1.3: Transport Configuration (8 hours)

#### Task 1.3.1: Implement stdio Transport
- **File:** `src/transports/stdioTransport.ts`
- **Action:** Configure stdio transport for local MCP clients
- **Acceptance:** Server responds to stdin requests
- **Test:** Echo test via stdio

#### Task 1.3.2: Implement SSE Transport (Optional)
- **File:** `src/transports/sseTransport.ts`
- **Action:** HTTP SSE transport for web-based clients
- **Acceptance:** Server exposes /sse endpoint
- **Test:** Curl test to /sse endpoint

#### Task 1.3.3: Add Transport Selection Config
- **File:** Update `config.json` with transport settings
- **Acceptance:** Can switch between stdio/SSE via config
- **Test:** Both transports work independently

### Task 1.4: MCP Server Testing (12 hours)

#### Task 1.4.1: Create MCP Client Test Harness
- **File:** `tests/mcp/mcpClientHarness.ts`
- **Action:** Build test client using MCP SDK
- **Acceptance:** Can send/receive MCP messages
- **Test:** Round-trip test

#### Task 1.4.2: End-to-End Tool Tests
- **File:** `tests/mcp/e2e-tools.test.ts`
- **Action:** Test all 12 tools via MCP protocol
- **Acceptance:** All tools respond with correct schemas
- **Test:** `npm test -- tests/mcp/e2e-tools.test.ts`

#### Task 1.4.3: Integration with Claude Code
- **Action:** Configure ALCS as MCP server in Claude Code
- **Acceptance:** Tools appear in Claude Code interface
- **Test:** Manual test - execute simple task

#### Task 1.4.4: Create MCP Server Documentation
- **File:** `docs/MCP-SERVER-USAGE.md`
- **Content:** How to configure MCP clients to use ALCS
- **Acceptance:** Step-by-step guide for Claude Code, Copilot, Gemini
- **Test:** Follow guide manually

### Task 1.5: Server Lifecycle Management (6 hours)

#### Task 1.5.1: Implement Graceful Shutdown
- **File:** `src/mcp-server.ts`
- **Action:** Handle SIGTERM, SIGINT signals
- **Acceptance:** In-flight sessions complete before shutdown
- **Test:** Send SIGTERM during active session

#### Task 1.5.2: Add Health Check Endpoint
- **File:** `src/mcp-tools/healthCheckTool.ts`
- **Action:** Return server health status
- **Acceptance:** Reports endpoint connectivity
- **Test:** Health check returns 200 OK

#### Task 1.5.3: Add Server Logging
- **Action:** Log all MCP requests/responses
- **Acceptance:** Full audit trail in logs
- **Test:** Verify log entries for test session

---

## Phase 2: Persistent Storage (Weeks 4-5 - 60 hours)

**Goal:** Replace in-memory session storage with PostgreSQL

### Task 2.1: Database Setup (12 hours)

#### Task 2.1.1: Install Prisma ORM
- **Action:** `npm install prisma @prisma/client`
- **Acceptance:** Packages installed successfully
- **Test:** `npx prisma --version`

#### Task 2.1.2: Initialize Prisma Schema
- **File:** `prisma/schema.prisma`
- **Action:** Define database schema for sessions, artifacts, reviews
- **Acceptance:** Schema matches SessionState interface
- **Test:** `npx prisma format`

#### Task 2.1.3: Define Session Model
```prisma
model Session {
  id                 String   @id
  state              String
  current_iteration  Int
  max_iterations     Int
  quality_threshold  Float
  last_quality_score Float?
  score_history      Float[]
  content_hashes     String[]
  artifacts          Artifact[]
  created_at         DateTime @default(now())
  updated_at         DateTime @updatedAt
}
```
- **Acceptance:** Model compiles without errors
- **Test:** `npx prisma validate`

#### Task 2.1.4: Define Artifact Model
```prisma
model Artifact {
  id          String   @id
  session_id  String
  session     Session  @relation(fields: [session_id], references: [id])
  type        String
  description String
  content     String
  metadata    Json
  timestamp   BigInt
  created_at  DateTime @default(now())
}
```
- **Acceptance:** Foreign key relationship works
- **Test:** `npx prisma validate`

#### Task 2.1.5: Create Initial Migration
- **Action:** `npx prisma migrate dev --name init`
- **Acceptance:** Migration creates tables
- **Test:** Check database has sessions and artifacts tables

#### Task 2.1.6: Update config.json with Database Settings
```json
"database": {
  "provider": "postgresql",
  "url": "postgresql://user:password@localhost:5432/alcs"
}
```
- **Acceptance:** Connection string valid
- **Test:** Connection test script

### Task 2.2: Database Service (16 hours)

#### Task 2.2.1: Create Database Service
- **File:** `src/services/databaseService.ts`
- **Content:**
```typescript
import { PrismaClient } from '@prisma/client';

export class DatabaseService {
  private prisma: PrismaClient;

  async connect(): Promise<void> { ... }
  async disconnect(): Promise<void> { ... }
  async healthCheck(): Promise<boolean> { ... }
}

export const dbService = new DatabaseService();
```
- **Acceptance:** Service compiles
- **Test:** Unit test for connection/disconnection

#### Task 2.2.2: Implement Connection Pooling
- **Action:** Configure Prisma connection pool
- **Acceptance:** Max 10 connections, min 2
- **Test:** Load test with concurrent requests

#### Task 2.2.3: Add Connection Retry Logic
- **Action:** Retry on connection failure with exponential backoff
- **Acceptance:** Recovers from transient DB failures
- **Test:** Stop/start database during connection

#### Task 2.2.4: Add Database Migrations Runner
- **File:** `src/scripts/runMigrations.ts`
- **Action:** Run migrations programmatically
- **Acceptance:** Can migrate from code
- **Test:** Fresh DB to latest schema

### Task 2.3: Refactor Session Manager (20 hours)

#### Task 2.3.1: Update createSessionState
- **File:** `src/sessionManager.ts`
- **Action:** Replace Map.set() with Prisma create()
```typescript
export async function createSessionState(sessionId: string): Promise<SessionState> {
  const session = await dbService.prisma.session.create({
    data: {
      id: sessionId,
      state: StateMachineState.IDLE,
      current_iteration: 0,
      // ... other fields
    }
  });
  return mapDbSessionToState(session);
}
```
- **Acceptance:** Creates DB record
- **Test:** Verify record in database

#### Task 2.3.2: Update getSessionState
- **Action:** Replace Map.get() with Prisma findUnique()
- **Acceptance:** Retrieves session from DB
- **Test:** Get existing and non-existing sessions

#### Task 2.3.3: Update updateSessionState
- **Action:** Replace Map.set() with Prisma update()
- **Acceptance:** Updates DB record with all changes
- **Test:** Verify update timestamp changes

#### Task 2.3.4: Update deleteSessionState
- **Action:** Replace Map.delete() with Prisma delete()
- **Acceptance:** Soft delete or hard delete based on config
- **Test:** Verify deletion

#### Task 2.3.5: Implement Session Cleanup Job
- **File:** `src/jobs/sessionCleanup.ts`
- **Action:** Delete sessions older than 30 days
- **Acceptance:** Runs on schedule (daily)
- **Test:** Mock old sessions and verify cleanup

#### Task 2.3.6: Add Session Pagination
- **Action:** Support listing sessions with pagination
- **Acceptance:** Can page through large session lists
- **Test:** Create 100 sessions, page through them

### Task 2.4: Artifact Persistence (8 hours)

#### Task 2.4.1: Store Artifacts in Database
- **Action:** When artifacts created, save to DB
- **Acceptance:** Artifacts table populated
- **Test:** Create session with 5 artifacts

#### Task 2.4.2: Implement Artifact Retrieval
- **Action:** Load artifacts with session
- **Acceptance:** Session includes all artifacts
- **Test:** Verify artifact content integrity

#### Task 2.4.3: Add Artifact Compression (Optional)
- **Action:** Compress large artifact content
- **Acceptance:** Reduces DB size for large code files
- **Test:** Compare compressed vs uncompressed size

### Task 2.5: Database Testing (4 hours)

#### Task 2.5.1: Update All Unit Tests
- **Action:** Mock Prisma client in tests
- **Acceptance:** All tests pass with DB mocking
- **Test:** Full test suite

#### Task 2.5.2: Create DB Integration Tests
- **File:** `tests/integration/database.test.ts`
- **Action:** Test CRUD operations on real DB
- **Acceptance:** All operations work correctly
- **Test:** Use test database

#### Task 2.5.3: Add Database Seeding
- **File:** `prisma/seed.ts`
- **Action:** Seed test data
- **Acceptance:** Can populate DB for development
- **Test:** `npx prisma db seed`

---

## Phase 3: Real Test Execution & Static Analysis (Weeks 6-7 - 70 hours)

**Goal:** Replace mock test coverage and policy violations with real tool integrations

### Task 3.1: Test Runner Service (28 hours)

#### Task 3.1.1: Design Test Runner Architecture
- **File:** `docs/TEST-RUNNER-ARCHITECTURE.md`
- **Content:** How sandboxed execution will work
- **Acceptance:** Architecture reviewed and approved
- **Test:** N/A (design doc)

#### Task 3.1.2: Create Test Runner Service Base
- **File:** `src/services/testRunnerService.ts`
```typescript
export class TestRunnerService {
  async executeTests(
    codeArtifact: Artifact,
    testArtifact: Artifact,
    framework: TestFramework
  ): Promise<TestExecutionResult> { ... }
}
```
- **Acceptance:** Service compiles
- **Test:** Unit test with mocked execution

#### Task 3.1.3: Implement Temporary File Management
- **Action:** Write code and test to temp directory
- **Acceptance:** Files created in isolated temp dir
- **Test:** Verify temp file creation/cleanup

#### Task 3.1.4: Implement pytest Runner
- **File:** `src/services/testRunners/pytestRunner.ts`
- **Action:** Execute `pytest --cov --json-report`
- **Acceptance:** Parses pytest JSON output
- **Test:** Run real pytest on sample code

#### Task 3.1.5: Implement Jest Runner
- **File:** `src/services/testRunners/jestRunner.ts`
- **Action:** Execute `jest --coverage --json`
- **Acceptance:** Parses Jest JSON output
- **Test:** Run real Jest on sample code

#### Task 3.1.6: Implement Go Test Runner
- **File:** `src/services/testRunners/goTestRunner.ts`
- **Action:** Execute `go test -cover -json`
- **Acceptance:** Parses Go test output
- **Test:** Run real go test

#### Task 3.1.7: Implement JUnit Runner
- **File:** `src/services/testRunners/junitRunner.ts`
- **Action:** Execute Java tests with JUnit 5
- **Acceptance:** Parses JUnit XML reports
- **Test:** Run real JUnit tests

#### Task 3.1.8: Add Docker Sandbox Integration
- **File:** `src/services/sandboxService.ts`
- **Action:** Execute tests inside Docker container
- **Acceptance:** Isolated execution environment
- **Test:** Run test in container

#### Task 3.1.9: Implement Timeout Handling
- **Action:** Kill test execution after 5 minutes
- **Acceptance:** Long-running tests terminated
- **Test:** Test with infinite loop

#### Task 3.1.10: Parse Coverage Reports
- **Action:** Extract line/branch coverage from reports
- **Acceptance:** Returns numeric coverage percentage
- **Test:** Verify coverage calculation

#### Task 3.1.11: Convert Test Failures to Defects
- **Action:** Map failed assertions to Defect objects
- **Acceptance:** Each failure becomes a defect
- **Test:** Verify defect creation

#### Task 3.1.12: Add Resource Limits
- **Action:** Limit CPU, memory, disk for test execution
- **Acceptance:** Tests can't consume excessive resources
- **Test:** Test with resource-intensive code

#### Task 3.1.13: Security Hardening
- **Action:** Prevent network access, file system escape
- **Acceptance:** Sandboxed tests can't access host
- **Test:** Attempt to access host resources

#### Task 3.1.14: Test Runner Unit Tests
- **File:** `tests/services/testRunnerService.test.ts`
- **Acceptance:** All runner logic tested
- **Test:** 90%+ coverage

### Task 3.2: Static Analysis Service (24 hours)

#### Task 3.2.1: Create Static Analysis Service Base
- **File:** `src/services/staticAnalysisService.ts`
```typescript
export class StaticAnalysisService {
  async analyzeCode(
    artifact: Artifact,
    policies: PolicyRule[]
  ): Promise<StaticAnalysisResult> { ... }
}
```
- **Acceptance:** Service compiles
- **Test:** Unit test with mocked execution

#### Task 3.2.2: Implement ESLint Integration (JavaScript/TypeScript)
- **File:** `src/services/analyzers/eslintAnalyzer.ts`
- **Action:** Run ESLint programmatically
- **Acceptance:** Returns ESLint violations
- **Test:** Analyze code with known violations

#### Task 3.2.3: Implement Pylint/Flake8 Integration (Python Style)
- **File:** `src/services/analyzers/pylintAnalyzer.ts`
- **Action:** Execute `pylint --output-format=json`
- **Acceptance:** Returns style violations
- **Test:** Analyze Python code

#### Task 3.2.4: Implement Bandit Integration (Python Security)
- **File:** `src/services/analyzers/banditAnalyzer.ts`
- **Action:** Execute `bandit -f json`
- **Acceptance:** Returns security issues
- **Test:** Test with insecure code

#### Task 3.2.5: Implement golangci-lint Integration (Go)
- **File:** `src/services/analyzers/golangciAnalyzer.ts`
- **Action:** Run golangci-lint
- **Acceptance:** Returns Go linting issues
- **Test:** Analyze Go code

#### Task 3.2.6: Implement Clippy Integration (Rust)
- **File:** `src/services/analyzers/clippyAnalyzer.ts`
- **Action:** Run `cargo clippy --message-format=json`
- **Acceptance:** Returns Rust linting issues
- **Test:** Analyze Rust code

#### Task 3.2.7: Map Violations to PolicyRules
- **Action:** Match analyzer output to policy definitions
- **Acceptance:** Violations linked to specific policies
- **Test:** Verify policy matching

#### Task 3.2.8: Convert Violations to Defects
- **Action:** Create Defect objects from violations
- **Acceptance:** Includes severity, location, fix suggestion
- **Test:** Verify defect structure

#### Task 3.2.9: Dangerous Pattern Detection Integration
- **Action:** Integrate with existing dangerousOutputDetector
- **Acceptance:** Dangerous patterns flagged as critical
- **Test:** Test with rm -rf, eval, etc.

#### Task 3.2.10: Add Analyzer Configuration
- **File:** Add to `config.json`
```json
"static_analysis": {
  "javascript": {
    "tool": "eslint",
    "config_file": ".eslintrc.json"
  },
  "python": {
    "style_tool": "flake8",
    "security_tool": "bandit"
  }
}
```
- **Acceptance:** Configurable per language
- **Test:** Load configuration

#### Task 3.2.11: Static Analysis Unit Tests
- **File:** `tests/services/staticAnalysisService.test.ts`
- **Acceptance:** All analyzer logic tested
- **Test:** 90%+ coverage

### Task 3.3: Integration with run_critic_review (12 hours)

#### Task 3.3.1: Refactor run_critic_review
- **File:** `src/tools/runCriticReview.ts`
- **Action:** Remove hardcoded testCoverage and policyViolations
- **Acceptance:** Uses real services
- **Test:** Integration test

#### Task 3.3.2: Call TestRunnerService
- **Action:** Execute tests if test artifact exists
- **Acceptance:** Real coverage returned
- **Test:** Session with test artifact

#### Task 3.3.3: Call StaticAnalysisService
- **Action:** Analyze code artifact
- **Acceptance:** Real violations returned
- **Test:** Session with policy violations

#### Task 3.3.4: Aggregate Results
- **Action:** Combine Agent Beta review + test results + static analysis
- **Acceptance:** All defects in single list
- **Test:** Verify aggregation

#### Task 3.3.5: Update Quality Score Calculation
- **Action:** Use real coverage and violations
- **Acceptance:** Score reflects actual quality
- **Test:** Compare scores before/after

#### Task 3.3.6: Update Unit Tests
- **Action:** Mock TestRunnerService and StaticAnalysisService
- **Acceptance:** All tests pass
- **Test:** `npm test -- tests/tools/runCriticReview.test.ts`

### Task 3.4: Tool Installation & Dependencies (6 hours)

#### Task 3.4.1: Create Tool Installation Script
- **File:** `scripts/install-analysis-tools.sh`
- **Action:** Install pytest, eslint, bandit, etc.
- **Acceptance:** Script runs on fresh system
- **Test:** Run in clean Docker container

#### Task 3.4.2: Update Docker Image
- **File:** `Dockerfile`
- **Action:** Include all analysis tools
- **Acceptance:** Image builds successfully
- **Test:** `docker build -t alcs .`

#### Task 3.4.3: Add Tool Version Checks
- **File:** `src/utils/toolVersionCheck.ts`
- **Action:** Verify required tools installed
- **Acceptance:** Warns if tools missing
- **Test:** Test with/without tools

---

## Phase 4: Dynamic Recommendations (Week 8 - 24 hours)

**Goal:** Generate intelligent recommendations based on session data

### Task 4.1: Recommendation Service (16 hours)

#### Task 4.1.1: Create Recommendation Service
- **File:** `src/services/recommendationService.ts`
```typescript
export class RecommendationService {
  async generateRecommendations(
    session: SessionState
  ): Promise<string[]> { ... }
}
```
- **Acceptance:** Service compiles
- **Test:** Unit test with mock session

#### Task 4.1.2: Implement Defect Pattern Analysis
- **Action:** Identify recurring defects across iterations
- **Acceptance:** Returns common defect types
- **Test:** Session with repeated defects

#### Task 4.1.3: Implement Improvement Trend Analysis
- **Action:** Analyze score_history trajectory
- **Acceptance:** Identifies improving/degrading areas
- **Test:** Various score patterns

#### Task 4.1.4: Implement Stagnation Analysis
- **Action:** Detect when changes don't improve quality
- **Acceptance:** Suggests alternative approaches
- **Test:** Stagnant session

#### Task 4.1.5: Implement Model Performance Analysis
- **Action:** Correlate model used with success rate
- **Acceptance:** Suggests better model if needed
- **Test:** Sessions with different models

#### Task 4.1.6: Generate Language-Specific Tips
- **Action:** Provide language-specific best practices
- **Acceptance:** Contextual recommendations
- **Test:** Python, JavaScript, Go sessions

#### Task 4.1.7: Generate Framework-Specific Tips
- **Action:** Test framework recommendations
- **Acceptance:** Suggests better test patterns
- **Test:** Various frameworks

#### Task 4.1.8: Implement LLM-Based Recommendations (Optional)
- **Action:** Call LLM to analyze session history
- **Acceptance:** GPT-4/Claude analyzes failures
- **Test:** Compare with rule-based recommendations

### Task 4.2: Integration (8 hours)

#### Task 4.2.1: Update final_handoff_archive
- **File:** `src/tools/finalHandoffArchive.ts`
- **Action:** Call RecommendationService
- **Acceptance:** Real recommendations in response
- **Test:** Verify recommendations present

#### Task 4.2.2: Add Recommendation Caching
- **Action:** Cache recommendations per session
- **Acceptance:** Don't regenerate on multiple handoffs
- **Test:** Multiple handoff calls

#### Task 4.2.3: Update Unit Tests
- **File:** `tests/tools/finalHandoffArchive.test.ts`
- **Acceptance:** Tests pass with real service
- **Test:** `npm test -- tests/tools/finalHandoffArchive.test.ts`

---

## Phase 5: Production Readiness (Weeks 9-10 - 80 hours)

**Goal:** Enterprise deployment, monitoring, documentation, security

### Task 5.1: Containerization (16 hours)

#### Task 5.1.1: Create Production Dockerfile
- **File:** `Dockerfile.prod`
- **Content:** Multi-stage build, minimal image
- **Acceptance:** Image < 500MB
- **Test:** `docker build -f Dockerfile.prod -t alcs:prod .`

#### Task 5.1.2: Create Docker Compose Configuration
- **File:** `docker-compose.yml`
- **Services:** ALCS, PostgreSQL, Redis (optional)
- **Acceptance:** Full stack starts with one command
- **Test:** `docker-compose up`

#### Task 5.1.3: Add Environment Variable Configuration
- **Action:** Replace config.json with env vars
- **Acceptance:** 12-factor app compliance
- **Test:** Override all settings via env

#### Task 5.1.4: Create Kubernetes Manifests
- **Files:** `k8s/deployment.yaml`, `k8s/service.yaml`, etc.
- **Acceptance:** Deploys to K8s cluster
- **Test:** `kubectl apply -f k8s/`

#### Task 5.1.5: Add Health Check Endpoints
- **Endpoints:** `/health`, `/ready`, `/live`
- **Acceptance:** K8s probes work
- **Test:** Curl endpoints

### Task 5.2: Monitoring & Observability (20 hours)

#### Task 5.2.1: Add Prometheus Metrics
- **File:** `src/services/metricsService.ts`
- **Metrics:**
  - `alcs_sessions_total` (counter)
  - `alcs_session_duration_seconds` (histogram)
  - `alcs_iterations_per_session` (histogram)
  - `alcs_quality_score` (gauge)
  - `alcs_llm_requests_total` (counter)
  - `alcs_llm_request_duration_seconds` (histogram)
- **Acceptance:** Prometheus scrapes metrics
- **Test:** Check /metrics endpoint

#### Task 5.2.2: Add Structured Logging
- **Action:** Use JSON logging format
- **Acceptance:** Logs parseable by ELK/Loki
- **Test:** Verify JSON structure

#### Task 5.2.3: Add Distributed Tracing
- **Library:** OpenTelemetry
- **Action:** Trace requests through system
- **Acceptance:** Jaeger shows traces
- **Test:** View trace for full session

#### Task 5.2.4: Create Grafana Dashboards
- **File:** `monitoring/grafana-dashboard.json`
- **Panels:** Session metrics, quality trends, error rates
- **Acceptance:** Dashboard imports to Grafana
- **Test:** View dashboard

#### Task 5.2.5: Add Alerting Rules
- **File:** `monitoring/prometheus-alerts.yaml`
- **Alerts:**
  - High error rate
  - Long session duration
  - Low quality scores
  - LLM endpoint down
- **Acceptance:** Alerts fire in test
- **Test:** Trigger each alert

#### Task 5.2.6: Add Error Tracking
- **Library:** Sentry
- **Action:** Send exceptions to Sentry
- **Acceptance:** Errors appear in Sentry UI
- **Test:** Trigger error

### Task 5.3: Security Hardening (20 hours)

#### Task 5.3.1: Add Authentication for MCP Server
- **Method:** API keys or OAuth2
- **Acceptance:** Unauthorized requests rejected
- **Test:** Request without auth token

#### Task 5.3.2: Implement Rate Limiting
- **Library:** express-rate-limit
- **Action:** Limit requests per API key
- **Acceptance:** 429 Too Many Requests
- **Test:** Exceed rate limit

#### Task 5.3.3: Add Input Validation
- **Library:** Joi or Zod
- **Action:** Validate all MCP tool inputs
- **Acceptance:** Malformed requests rejected
- **Test:** Send invalid payloads

#### Task 5.3.4: Implement SQL Injection Prevention
- **Action:** Verify Prisma prevents SQLi
- **Acceptance:** Parameterized queries only
- **Test:** Attempt SQLi attack

#### Task 5.3.5: Add Secrets Management
- **Tool:** HashiCorp Vault or AWS Secrets Manager
- **Action:** Store API keys securely
- **Acceptance:** No secrets in config files
- **Test:** Retrieve secrets from vault

#### Task 5.3.6: Enable HTTPS/TLS
- **Action:** Configure TLS for SSE transport
- **Acceptance:** No plain HTTP
- **Test:** Verify TLS certificate

#### Task 5.3.7: Security Audit
- **Tool:** npm audit, Snyk
- **Action:** Fix all high/critical vulnerabilities
- **Acceptance:** Clean audit report
- **Test:** `npm audit`

#### Task 5.3.8: Penetration Testing
- **Action:** Run OWASP ZAP against server
- **Acceptance:** No critical findings
- **Test:** Generate ZAP report

### Task 5.4: Performance Optimization (12 hours)

#### Task 5.4.1: Add Response Caching
- **Library:** Redis
- **Action:** Cache get_repo_map, read_org_policies
- **Acceptance:** 10x faster on cache hit
- **Test:** Benchmark with/without cache

#### Task 5.4.2: Database Query Optimization
- **Action:** Add indexes, optimize joins
- **Acceptance:** Sub-100ms query times
- **Test:** EXPLAIN ANALYZE queries

#### Task 5.4.3: Implement Connection Pooling
- **Action:** Pool LLM HTTP connections
- **Acceptance:** Reuse connections
- **Test:** Monitor connection count

#### Task 5.4.4: Add Request Batching
- **Action:** Batch multiple LLM requests
- **Acceptance:** Reduce API calls
- **Test:** Compare batch vs individual

#### Task 5.4.5: Load Testing
- **Tool:** k6 or Artillery
- **Action:** Simulate 100 concurrent sessions
- **Acceptance:** No errors, <5s p95 latency
- **Test:** Generate load test report

### Task 5.5: Documentation (12 hours)

#### Task 5.5.1: Update README.md
- **Content:**
  - Installation (Docker, npm, K8s)
  - Configuration
  - Quick start
  - Troubleshooting
- **Acceptance:** New user can deploy in 15 min
- **Test:** Follow guide on fresh system

#### Task 5.5.2: Create API Documentation
- **File:** `docs/API.md`
- **Content:** All MCP tools with examples
- **Acceptance:** Every parameter documented
- **Test:** Review completeness

#### Task 5.5.3: Create Architecture Documentation
- **File:** `docs/ARCHITECTURE.md`
- **Content:** System design, data flow, state machine
- **Acceptance:** Diagrams + explanations
- **Test:** Technical review

#### Task 5.5.4: Create Operations Guide
- **File:** `docs/OPERATIONS.md`
- **Content:** Deployment, monitoring, troubleshooting
- **Acceptance:** Ops team can run production
- **Test:** Ops team review

#### Task 5.5.5: Create Development Guide
- **File:** `docs/DEVELOPMENT.md`
- **Content:** How to contribute, testing, debugging
- **Acceptance:** New dev can add feature
- **Test:** Developer review

#### Task 5.5.6: Create Security Guide
- **File:** `docs/SECURITY.md`
- **Content:** Security model, threat analysis
- **Acceptance:** Security team approval
- **Test:** Security review

---

## Phase 6: Quality Assurance (Week 11 - 40 hours)

**Goal:** Comprehensive testing and validation

### Task 6.1: Integration Testing (16 hours)

#### Task 6.1.1: Create Full E2E Test Suite
- **File:** `tests/e2e/full-workflow.test.ts`
- **Scenarios:**
  - Python function generation
  - JavaScript API endpoint
  - Go microservice
  - React component
- **Acceptance:** All scenarios pass
- **Test:** `npm run test:e2e`

#### Task 6.1.2: Multi-Language Test Suite
- **Action:** Test all supported languages
- **Acceptance:** Python, JS, Go, Rust, Java work
- **Test:** Generate code in each language

#### Task 6.1.3: Multi-Framework Test Suite
- **Action:** Test all test frameworks
- **Acceptance:** pytest, Jest, JUnit, etc. work
- **Test:** Generate tests in each framework

#### Task 6.1.4: Failure Scenario Testing
- **Scenarios:**
  - LLM endpoint down
  - Database connection lost
  - Invalid task spec
  - Dangerous code generation
- **Acceptance:** Graceful degradation
- **Test:** Verify error handling

#### Task 6.1.5: Performance Testing
- **Action:** Load test with 100 concurrent sessions
- **Acceptance:** No errors, stable latency
- **Test:** Generate performance report

### Task 6.2: Compatibility Testing (8 hours)

#### Task 6.2.1: Test with Claude Code
- **Action:** Configure ALCS in Claude Code
- **Acceptance:** All tools work
- **Test:** Manual testing

#### Task 6.2.2: Test with MS Copilot
- **Action:** Configure ALCS in Copilot
- **Acceptance:** All tools work
- **Test:** Manual testing

#### Task 6.2.3: Test with Gemini CLI
- **Action:** Configure ALCS in Gemini
- **Acceptance:** All tools work
- **Test:** Manual testing

#### Task 6.2.4: Test with Different LLM Providers
- **Providers:** Ollama, LM Studio, OpenRouter
- **Acceptance:** All providers work
- **Test:** Session with each provider

### Task 6.3: Regression Testing (8 hours)

#### Task 6.3.1: Create Regression Test Suite
- **Action:** Capture current behavior as tests
- **Acceptance:** Baseline established
- **Test:** All tests pass

#### Task 6.3.2: Add Visual Regression Tests
- **Tool:** Percy or Chromatic (if UI added)
- **Acceptance:** UI changes detected
- **Test:** Screenshot comparison

### Task 6.4: User Acceptance Testing (8 hours)

#### Task 6.4.1: Beta Testing Program
- **Action:** Invite 5-10 users to test
- **Acceptance:** Collect feedback
- **Test:** Survey results

#### Task 6.4.2: Fix Critical Issues
- **Action:** Address P0/P1 bugs
- **Acceptance:** No blockers
- **Test:** Re-test fixed issues

---

## Phase 7: Deployment & Launch (Week 12 - 16 hours)

**Goal:** Go live with production deployment

### Task 7.1: Production Deployment (8 hours)

#### Task 7.1.1: Provision Infrastructure
- **Action:** Set up prod servers/cluster
- **Acceptance:** Infrastructure ready
- **Test:** Access check

#### Task 7.1.2: Deploy to Production
- **Action:** Run deployment scripts
- **Acceptance:** Service running
- **Test:** Health check passes

#### Task 7.1.3: Configure Monitoring
- **Action:** Set up Grafana, alerts
- **Acceptance:** Dashboards active
- **Test:** View metrics

#### Task 7.1.4: Configure Backups
- **Action:** Database backup schedule
- **Acceptance:** Daily backups
- **Test:** Restore from backup

### Task 7.2: Launch Activities (8 hours)

#### Task 7.2.1: Create Release Notes
- **File:** `CHANGELOG.md`
- **Content:** v1.0.0 features
- **Acceptance:** Complete change log
- **Test:** Review

#### Task 7.2.2: Publish Documentation
- **Action:** Deploy docs site
- **Acceptance:** Docs accessible
- **Test:** Browse documentation

#### Task 7.2.3: Announcement
- **Action:** Blog post, social media
- **Acceptance:** Community notified
- **Test:** Post published

#### Task 7.2.4: Support Setup
- **Action:** Create support channels
- **Acceptance:** Users can get help
- **Test:** Submit test ticket

---

## Success Criteria for GA

### Functional Requirements
- ✅ All 12 MCP tools working via protocol
- ✅ Real LLM integration (Ollama, LM Studio, OpenRouter)
- ✅ Persistent session storage (PostgreSQL)
- ✅ Real test execution (8+ frameworks)
- ✅ Real static analysis (5+ languages)
- ✅ Dynamic recommendations
- ✅ Review-revise loop with termination
- ✅ State machine with all transitions

### Quality Requirements
- ✅ 100% unit test pass rate
- ✅ 90%+ code coverage
- ✅ Zero critical security vulnerabilities
- ✅ All integration tests passing
- ✅ Load test: 100 concurrent sessions
- ✅ P95 latency < 5 seconds

### Operational Requirements
- ✅ Docker deployment working
- ✅ Kubernetes deployment working
- ✅ Monitoring and alerting active
- ✅ Documentation complete
- ✅ Support channels established
- ✅ Backup and restore tested

### Compatibility Requirements
- ✅ Works with Claude Code
- ✅ Works with MS Copilot
- ✅ Works with Gemini CLI
- ✅ Supports 5+ programming languages
- ✅ Supports 8+ test frameworks

---

## Risk Management

### High Priority Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker sandbox escape | Critical | Use gVisor, strict seccomp profiles |
| Database performance degradation | High | Connection pooling, caching, indexing |
| LLM endpoint rate limiting | High | Request queuing, fallback endpoints |
| Test execution timeout | Medium | Configurable timeouts, resource limits |
| MCP protocol changes | Medium | Pin SDK version, monitor changelog |

### Monitoring Plan

- Daily: Check error rates, latency metrics
- Weekly: Review quality score trends
- Monthly: Security audit, dependency updates

---

## Appendix: Testing Checklist

### Pre-Launch Checklist

- [ ] All unit tests pass (100%)
- [ ] All integration tests pass (100%)
- [ ] E2E tests pass for all languages
- [ ] Load test completed successfully
- [ ] Security audit clean
- [ ] Documentation reviewed
- [ ] Backup/restore tested
- [ ] Monitoring dashboards working
- [ ] Support channels ready
- [ ] Deployment runbook tested

### Post-Launch Monitoring

- [ ] Error rate < 1%
- [ ] P95 latency < 5s
- [ ] Database queries < 100ms
- [ ] No critical alerts
- [ ] User feedback positive
- [ ] Quality scores trending up

---

**Document Version:** 1.0
**Last Updated:** 2026-01-01
**Status:** Ready for Execution
