# Dual-Agent Local Coding Service
## Technical Specification & Implementation Guide

---

## Executive Summary

This document provides the complete technical specification for a **Dual-Agent Local Coding Service** exposed via the Model Context Protocol (MCP). The system enables high-reasoning proprietary models to delegate coding tasks to specialized local agents, combining the reasoning capabilities of cloud-based AI with the cost efficiency of local LLM inference.

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MCP Server Stack | TypeScript (Official SDK) | Most commonly used, best documentation, native MCP support |
| State Persistence | Ephemeral/Session-based | Orchestration Layer maintains project state; simplifies server design |
| Concurrency Model | ≤5 concurrent requests | Balanced for single workstation; configurable for team deployment |
| Context Window | 32K-256K tokens | Accommodates modern local models while enabling chunking strategies |

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATION LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Claude Code │  │ MS Copilot  │  │ Gemini CLI  │  │ Antigravity│ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                            MCP Protocol                              │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         MCP SERVER LAYER                              │
│                      (TypeScript Bridge)                              │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Tools: execute_task_spec | run_critic_review | configure_endpoint│
│  │         get_repo_map | revise_code | final_handoff_archive       │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  State Machine: IDLE → GENERATING → REVIEWING → CONVERGED/FAILED │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│      AGENT ALPHA              │   │       AGENT BETA              │
│    (Code Generator)           │   │      (Reviewer)               │
│  ┌─────────────────────────┐  │   │  ┌─────────────────────────┐  │
│  │ Providers:              │  │   │  │ Recommended:            │  │
│  │ • Ollama                │  │   │  │ • DeepSeek-R1           │  │
│  │ • LM Studio             │  │   │  │ • Llama-3-70B           │  │
│  │ • OpenRouter            │  │   │  │ • Qwen2.5-72B           │  │
│  └─────────────────────────┘  │   │  └─────────────────────────┘  │
│  Output: Code artifacts       │   │  Output: Reviews, Tests,     │
│                               │   │          Quality Scores       │
└───────────────────────────────┘   └───────────────────────────────┘
```

---

## 2. MCP Toolset Reference

### 2.1 Context Management

#### `get_repo_map`
```typescript
interface GetRepoMapParams {
  path: string;              // Repository root path
  depth?: number;            // Max directory depth (default: 5)
  include_tests?: boolean;   // Include test files (default: false)
}

interface GetRepoMapResponse {
  structure: FileNode[];     // Hierarchical file tree
  total_files: number;
  total_tokens_estimated: number;
  chunks?: RepoChunk[];      // If exceeds context window
}
```

#### `get_project_status`
```typescript
interface GetProjectStatusParams {
  session_id?: string;       // Optional; returns current session if omitted
}

interface GetProjectStatusResponse {
  session_id: string;
  state: StateMachineState;
  current_iteration: number;
  max_iterations: number;
  quality_threshold: number;
  last_quality_score?: number;
  artifacts: ArtifactSummary[];
  elapsed_time_ms: number;
}
```

#### `read_org_policies`
```typescript
type PolicyType = 'style' | 'security' | 'custom';

interface ReadOrgPoliciesParams {
  policy_type: PolicyType;
}

interface ReadOrgPoliciesResponse {
  policy_type: PolicyType;
  rules: PolicyRule[];
  source: 'file' | 'default';  // 'default' for OWASP baseline
}
```

### 2.2 Development Loop

#### `execute_task_spec`
```typescript
interface TaskSpec {
  description: string;
  language: string;
  context_files?: string[];
  constraints?: string[];
  examples?: CodeExample[];
}

interface ExecuteTaskSpecParams {
  spec: TaskSpec;
  max_iterations?: number;      // Default: 5
  quality_threshold?: number;   // Default: 85 (0-100)
}

interface ExecuteTaskSpecResponse {
  session_id: string;
  status: 'accepted' | 'rejected';
  rejection_reason?: string;
  estimated_duration_ms?: number;
}
```

#### `revise_code`
```typescript
interface ReviseCodeParams {
  artifact_id: string;
  feedback: ReviewFeedback;
}

interface ReviewFeedback {
  quality_score: number;        // 0-100
  defects: Defect[];
  suggestions: string[];
  required_changes: string[];   // Must-fix items
}
```

#### `inject_alternative_pattern`
```typescript
interface InjectAlternativePatternParams {
  pattern: CodePattern;
  context: string;              // Why this pattern is suggested
}

interface CodePattern {
  name: string;
  description: string;
  template: string;
  examples?: string[];
}
```

### 2.3 Validation

#### `run_critic_review`
```typescript
type ReviewDepth = 'quick' | 'standard' | 'comprehensive';

interface RunCriticReviewParams {
  artifact_id: string;
  review_depth: ReviewDepth;
}

interface RunCriticReviewResponse {
  review_id: string;
  quality_score: number;
  defects: Defect[];
  test_coverage_estimate: number;
  policy_violations: PolicyViolation[];
  suggestions: string[];
  recommendation: 'approve' | 'revise' | 'escalate';
}
```

#### `generate_test_suite`
```typescript
type TestFramework = 
  | 'pytest' | 'jest' | 'go_testing' | 'rust_test'
  | 'gtest' | 'junit5' | 'jasmine' | 'pgtap';

interface GenerateTestSuiteParams {
  artifact_id: string;
  framework: TestFramework;
  coverage_target?: number;     // Default: 80
}

interface GenerateTestSuiteResponse {
  test_artifact_id: string;
  test_count: number;
  estimated_coverage: number;
  test_code: string;
}
```

### 2.4 Infrastructure

#### `configure_endpoint`
```typescript
type AgentType = 'alpha' | 'beta';
type ProviderType = 'ollama' | 'lmstudio' | 'openrouter';

interface ProviderConfig {
  type: ProviderType;
  base_url: string;
  model: string;
  api_key?: string;             // Required for OpenRouter
  context_window?: number;
}

interface ConfigureEndpointParams {
  agent: AgentType;
  provider: ProviderConfig;
}

interface ConfigureEndpointResponse {
  success: boolean;
  health_check: HealthCheckResult;
  previous_config?: ProviderConfig;
}
```

#### `set_system_prompts`
```typescript
interface SystemPromptConfig {
  base_prompt: string;
  task_prefix?: string;
  constraints?: string[];
  output_format?: string;
}

interface SetSystemPromptsParams {
  agent: AgentType;
  prompts: SystemPromptConfig;
}
```

### 2.5 Reporting

#### `get_progress_summary`
```typescript
type Verbosity = 'minimal' | 'standard' | 'detailed';

interface GetProgressSummaryParams {
  session_id: string;
  verbosity?: Verbosity;
}

interface GetProgressSummaryResponse {
  session_id: string;
  iterations_completed: number;
  quality_scores: number[];     // Score per iteration
  time_per_iteration_ms: number[];
  current_state: StateMachineState;
  convergence_trend: 'improving' | 'stagnant' | 'oscillating';
}
```

#### `final_handoff_archive`
```typescript
interface FinalHandoffArchiveParams {
  session_id: string;
  include_audit?: boolean;      // Default: true
}

interface FinalHandoffArchiveResponse {
  archive_id: string;
  final_artifact: Artifact;
  test_suite?: Artifact;
  final_quality_score: number;
  total_iterations: number;
  audit_trail?: AuditEntry[];
  recommendations: string[];
}
```

---

## 3. State Machine Specification

### 3.1 State Definitions

```typescript
enum StateMachineState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  REVIEWING = 'REVIEWING',
  REVISING = 'REVISING',
  CONVERGED = 'CONVERGED',
  ESCALATED = 'ESCALATED',
  FAILED = 'FAILED'
}
```

### 3.2 Transition Rules

```
IDLE ─────────────────────────────────────────────────────────────────►
  │                                                                    
  │ execute_task_spec() called                                         
  ▼                                                                    
GENERATING ───────────────────────────────────────────────────────────►
  │                                         │                          
  │ Alpha completes                         │ Endpoint unavailable     
  ▼                                         ▼                          
REVIEWING ◄─────────────────────────────── FAILED ────────────────────►
  │         Alpha completes revision          │                        
  │ ▲                                         │ Error acknowledged     
  │ │ score < threshold                       ▼                        
  │ │ AND iter < max                        IDLE                       
  │ │ AND improving                                                    
  │ │                                                                  
  ▼ │                                                                  
REVISING ─────────────────────────────────────────────────────────────►
  │                                                                    
  │                                                                    
REVIEWING ────────────────────────────────────────────────────────────►
  │                               │                                    
  │ score ≥ threshold             │ iter ≥ max OR stagnant             
  ▼                               ▼                                    
CONVERGED                      ESCALATED                               
  │                               │                                    
  │ Handoff complete              │ Orchestration decision             
  ▼                               ▼                                    
IDLE ◄─────────────────────────── IDLE / REVISING / FAILED             
```

### 3.3 Loop Prevention Implementation

```typescript
interface LoopGuard {
  maxIterations: number;           // Hard cap (default: 5)
  stagnationThreshold: number;     // Min score delta (default: 2)
  stagnationWindow: number;        // Consecutive iterations (default: 2)
  oscillationDetection: boolean;   // Enable hash comparison
  timeoutMs: number;               // Per-task timeout (default: 1800000)
}

class StateMachine {
  private state: StateMachineState = 'IDLE';
  private iterationCount: number = 0;
  private scoreHistory: number[] = [];
  private contentHashes: Set<string> = new Set();
  private startTime: number = 0;

  canTransitionToRevising(newScore: number, contentHash: string): boolean {
    // Check iteration cap
    if (this.iterationCount >= this.guard.maxIterations) {
      return false;
    }

    // Check stagnation
    if (this.scoreHistory.length >= this.guard.stagnationWindow) {
      const recentScores = this.scoreHistory.slice(-this.guard.stagnationWindow);
      const deltas = recentScores.map((s, i) => 
        i === 0 ? 0 : Math.abs(s - recentScores[i-1])
      );
      if (deltas.every(d => d < this.guard.stagnationThreshold)) {
        return false; // Stagnant
      }
    }

    // Check oscillation
    if (this.guard.oscillationDetection && this.contentHashes.has(contentHash)) {
      return false; // Oscillating
    }

    // Check timeout
    if (Date.now() - this.startTime > this.guard.timeoutMs) {
      return false;
    }

    return true;
  }
}
```

---

## 4. Error Handling Protocols

### 4.1 Exponential Backoff

```typescript
class RetryHandler {
  private readonly maxRetryDuration = 10 * 60 * 1000; // 10 minutes
  private readonly maxBackoff = 256 * 1000;           // 256 seconds
  private readonly baseDelay = 1000;                  // 1 second

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < this.maxRetryDuration) {
      try {
        return await operation();
      } catch (error) {
        attempt++;
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt - 1),
          this.maxBackoff
        );
        
        this.logger.warn(`Retry ${attempt} for ${context}, waiting ${delay}ms`);
        await this.sleep(delay);
      }
    }

    throw new EndpointUnavailableError(context, this.maxRetryDuration);
  }
}
```

### 4.2 Dangerous Output Detection

```typescript
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/i,           // Destructive file operations
  /DROP\s+(TABLE|DATABASE)/i,    // SQL destruction
  /DELETE\s+FROM\s+\w+\s*;/i,    // Unbounded deletes
  /while\s*\(\s*true\s*\)/,      // Obvious infinite loops
  /for\s*\(\s*;\s*;\s*\)/,       // Infinite for loops
  /exec\s*\(/,                   // Dynamic code execution
  /eval\s*\(/,                   // Eval usage
  /subprocess\.call.*shell=True/,// Shell injection risk
];

interface DangerousOutputReport {
  artifact_id: string;
  patterns_matched: string[];
  severity: 'warning' | 'critical';
  quarantined: boolean;
  recommendation: string;
}
```

### 4.3 Escalation Protocol

```typescript
interface EscalationMessage {
  session_id: string;
  reason: EscalationReason;
  best_artifact: Artifact;
  iteration_history: IterationSummary[];
  final_critique: ReviewFeedback;
  available_actions: EscalationAction[];
}

type EscalationReason = 
  | 'max_iterations_reached'
  | 'stagnation_detected'
  | 'oscillation_detected'
  | 'timeout_exceeded'
  | 'dangerous_output_detected';

type EscalationAction =
  | { type: 'switch_llm'; target_agent: AgentType; suggested_model?: string }
  | { type: 'retry_with_constraints'; additional_constraints: string[] }
  | { type: 'abort' }
  | { type: 'accept_best_effort' };
```

---

## 5. Configuration Schema

```typescript
interface ServerConfig {
  // Deployment
  deployment_mode: 'workstation' | 'team';
  max_concurrent_requests: number;  // Default: 5
  
  // Context
  context_window: {
    min: number;  // 32000
    max: number;  // 256000
  };
  
  // Loop Defaults
  default_quality_threshold: number;  // 85
  default_max_iterations: number;     // 5
  task_timeout_minutes: number;       // 30
  retry_ceiling_minutes: number;      // 10
  
  // Endpoints
  endpoints: {
    alpha: ProviderConfig;
    beta: ProviderConfig;
  };
  
  // Policies
  policies_path: string;
  rag_resources_path?: string;
  
  // Logging
  log_path: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}
```

---

## 6. Supported Test Frameworks

| Language | Framework | Import/Setup |
|----------|-----------|--------------|
| Python | pytest | `pip install pytest pytest-cov` |
| Go | testing | Built-in `testing` package |
| Rust | #[test] | Built-in test attribute |
| C/C++ | Google Test | `apt install libgtest-dev` |
| JavaScript | Jest | `npm install jest` |
| TypeScript | Jest | `npm install jest ts-jest @types/jest` |
| Angular | Jasmine/Karma | Included with Angular CLI |
| Java | JUnit 5 | Maven/Gradle dependency |
| SQL | pgTAP | PostgreSQL extension |

---

## 7. Implementation Timeline

| Phase | Duration | Key Deliverables | Exit Criteria |
|-------|----------|------------------|---------------|
| **1. Foundation** | 3 weeks | Project scaffold, Alpha connector, basic execute_task_spec | Single-agent task execution works |
| **2. MCP Integration** | 3 weeks | All MCP tools, Claude Code integration | Full toolset callable from orchestrators |
| **3. Logic & Validation** | 4 weeks | Beta agent, review loop, state machine | Alpha↔Beta loop functional with termination |
| **4. Hardening** | 4 weeks | Error handling, concurrency, docs | Production-ready, handles all error cases |

**Total Estimated Effort:** ~220 hours (6 weeks full-time equivalent)

---

## Appendix: Quick Reference

### State Transition Quick Reference

| From | To | Condition |
|------|-----|-----------|
| IDLE | GENERATING | execute_task_spec() |
| GENERATING | REVIEWING | Alpha completes |
| GENERATING | FAILED | Endpoint down >10min |
| REVIEWING | CONVERGED | score ≥ threshold |
| REVIEWING | REVISING | score < threshold AND improving |
| REVIEWING | ESCALATED | max_iter OR stagnant |
| REVISING | REVIEWING | Alpha revision complete |
| REVISING | FAILED | Endpoint down >10min |
| ESCALATED | * | Orchestration decision |
| CONVERGED | IDLE | Handoff complete |
| FAILED | IDLE | Error acknowledged |

### Success Metrics Priority

1. **Functional Adherence** — ≥85% spec compliance
2. **Test Coverage** — ≥80% line coverage
3. **Defect Detection** — <5% escaped defects
4. **Policy Compliance** — 0 security violations
5. **Revision Efficiency** — ≤2 avg iterations

---

*Document Version: 1.0 | December 2025*
