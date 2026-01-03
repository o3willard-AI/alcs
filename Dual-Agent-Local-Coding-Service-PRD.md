# Dual-Agent Local Coding Service
## Product Requirements Document & Execution Plan

**Version 1.0 | January 2026**

MCP-Enabled Multi-Agent Orchestration System

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [MCP Toolset Specification](#3-mcp-toolset-specification)
4. [User Stories & Requirements](#4-user-stories--requirements)
5. [State Machine Specification](#5-state-machine-specification)
6. [System Sequence Diagram](#6-system-sequence-diagram)
7. [Error Handling Protocols](#7-error-handling-protocols)
8. [Phased Implementation Plan](#8-phased-implementation-plan)
9. [Micro-Task Backlog](#9-micro-task-backlog)
10. [Effort Summary](#10-effort-summary)
11. [Appendices](#appendices)

---

## 1. Executive Summary

This document defines the product requirements and execution plan for a Dual-Agent Local Coding Service exposed via the Model Context Protocol (MCP). The system enables high-reasoning proprietary models (Claude Code, MS Copilot, Gemini CLI) to delegate coding tasks to specialized local agents running on consumer-grade hardware.

The architecture consists of three layers: an Orchestration Layer (proprietary AI clients), an MCP Server Layer (the bridge), and an Execution Layer (two local LLM agents). Agent Alpha handles code generation while Agent Beta performs validation, testing, and critique. This separation enables cost-effective local computation while leveraging cloud-based reasoning capabilities for complex decision-making.

### 1.1 Document Metadata

| Attribute | Value |
|-----------|-------|
| Document Version | 1.0 |
| Status | Draft - Pending Review |
| Target Stack | TypeScript (Official MCP SDK) |
| Primary Clients | Claude Code, MS Copilot, Gemini CLI, Antigravity, Opencode |
| Deployment | Single workstation or Team server (configurable) |
| Concurrency | ≤5 simultaneous requests |

---

## 2. System Architecture

### 2.1 Three-Layer Architecture

The system implements a hierarchical three-layer architecture designed to separate concerns between high-level reasoning, protocol management, and task execution.

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

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Orchestration | Claude Code, Copilot, etc. | High-level reasoning, task decomposition, complexity assessment, final approval |
| MCP Server | TypeScript Bridge | Tool exposure, state management, agent coordination, loop control |
| Execution | Agent Alpha + Beta | Code generation (Alpha), validation/testing (Beta) |

### 2.2 Agent Specifications

#### 2.2.1 Agent Alpha (Primary Coder)

- **Purpose:** Code generation, implementation, refactoring based on task specifications
- **Providers:** Ollama, LM Studio, OpenRouter (runtime swappable)
- **Context Window:** 32K-256K tokens (configurable)
- **Output:** Code artifacts, implementation files, refactored segments

#### 2.2.2 Agent Beta (Reviewer/Validator)

- **Purpose:** Code review, test generation, static analysis, policy compliance
- **Recommended Models:** DeepSeek-R1, Llama-3-70B, or similar "thinking" models
- **Input:** Agent Alpha output only (no chain-of-thought access)
- **Authority:** Can require Alpha to adjust, improve, or refactor observed output

---

## 3. MCP Toolset Specification

The MCP server exposes the following tools to the Orchestration Layer, organized by functional category.

### 3.1 Context Management Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_repo_map` | `path: string`, `depth?: number`, `include_tests?: boolean` | Generates hierarchical repository structure with chunking for context window constraints (32K-256K) |
| `get_project_status` | `session_id?: string` | Returns current session state including pending tasks, completed items, active loops |
| `read_org_policies` | `policy_type: enum` | Retrieves style guides, security requirements (OWASP baseline), and custom constraints |

### 3.2 Development Loop Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `execute_task_spec` | `spec: TaskSpec`, `max_iterations?: number`, `quality_threshold?: number` | Sends task to Agent Alpha with loop constraints from Orchestration Layer |
| `revise_code` | `artifact_id: string`, `feedback: ReviewFeedback` | Instructs Alpha to revise specific artifact based on Beta feedback |
| `inject_alternative_pattern` | `pattern: CodePattern`, `context: string` | Provides alternative implementation approach when current pattern fails |

### 3.3 Validation Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `run_critic_review` | `artifact_id: string`, `review_depth: enum` | Triggers Agent Beta to perform comprehensive code review |
| `generate_test_suite` | `artifact_id: string`, `framework: TestFramework`, `coverage_target?: number` | Agent Beta generates unit tests for specified artifact |

### 3.4 Infrastructure Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `configure_endpoint` | `agent: AgentType`, `provider: ProviderConfig` | Runtime configuration of Alpha/Beta model endpoints |
| `set_system_prompts` | `agent: AgentType`, `prompts: SystemPromptConfig` | Updates agent system prompts for specialized tasks |

### 3.5 Reporting Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_progress_summary` | `session_id: string`, `verbosity?: enum` | Returns iteration counts, quality scores, and timing metrics |
| `final_handoff_archive` | `session_id: string`, `include_audit?: boolean` | Packages all artifacts with full audit trail for Orchestration Layer |

---

## 4. User Stories & Requirements

### 4.1 Core User Stories

#### US-001: Task Delegation

> As an **Orchestration Layer agent**, I want to delegate coding tasks to local agents via MCP tools so that I can offload compute-intensive generation while retaining decision authority.

**Acceptance Criteria:**
- Task specification accepted within 500ms
- Agent Alpha begins generation within 2s
- Progress polling available every 5s

---

#### US-002: Automated Review Loop

> As an **Orchestration Layer agent**, I want Alpha's output automatically reviewed by Beta so that code quality is validated before I receive it.

**Acceptance Criteria:**
- Beta review triggered within 1s of Alpha completion
- Review includes quality score (0-100), defect list, and improvement suggestions

---

#### US-003: Loop Termination Control

> As an **Orchestration Layer agent**, I want to set maximum iterations and quality thresholds so that review-revise loops terminate predictably.

**Acceptance Criteria:**
- Loop terminates when: (a) quality_threshold met, (b) max_iterations reached, or (c) no improvement across 2 consecutive iterations

---

#### US-004: Endpoint Flexibility

> As an **Orchestration Layer agent**, I want to swap underlying models at runtime so that I can unblock stuck tasks or optimize for specific languages.

**Acceptance Criteria:**
- Endpoint swap completes within 5s
- New model confirmed via health check
- In-flight tasks gracefully migrated or failed

---

#### US-005: Graceful Degradation

> As an **Orchestration Layer agent**, I want best-effort results with full audit trails when convergence fails so that I can make informed decisions about next steps.

**Acceptance Criteria:**
- Failed tasks return: best artifact, all iteration history, Beta's final critique, and recommendation for Orchestration Layer handling

---

### 4.2 Success Metrics for Agent Beta

Agent Beta's critique quality is measured across five dimensions, prioritized by importance:

| Rank | Metric | Target | Measurement Method |
|------|--------|--------|-------------------|
| 1 | Functional Adherence | ≥85% of generated code meets spec | Automated spec validation tests |
| 2 | Test Coverage | ≥80% line coverage on generated code | Coverage tool integration |
| 3 | Defect Detection Rate | <5% escaped defects to Orchestration | Post-handoff defect tracking |
| 4 | Policy Compliance | 0 security violations; style compliance ≥90% | Static analysis integration |
| 5 | Revision Reduction | ≤2 avg iterations before convergence | Session telemetry aggregation |

---

## 5. State Machine Specification

### 5.1 State Definitions

The MCP server maintains a finite state machine to prevent infinite review-revise loops and ensure predictable behavior.

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `IDLE` | No active task; awaiting execute_task_spec call | → GENERATING |
| `GENERATING` | Agent Alpha actively producing code | → REVIEWING, FAILED |
| `REVIEWING` | Agent Beta analyzing Alpha's output | → REVISING, CONVERGED, ESCALATED |
| `REVISING` | Alpha incorporating Beta feedback | → REVIEWING, FAILED |
| `CONVERGED` | Quality threshold met; ready for handoff | → IDLE |
| `ESCALATED` | Loop exhausted; awaiting Orchestration decision | → REVISING, IDLE, FAILED |
| `FAILED` | Unrecoverable error; endpoint unavailable >10min | → IDLE |

### 5.2 State Diagram

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
                 ┌──────┐                                 │
                 │ IDLE │◄────────────────────────────────┤
                 └──┬───┘                                 │
                    │                                     │
                    │ execute_task_spec()                 │
                    ▼                                     │
              ┌───────────┐                               │
              │GENERATING │                               │
              └─────┬─────┘                               │
                    │                                     │
         ┌──────────┼──────────┐                          │
         │          │          │                          │
         │ success  │          │ endpoint                 │
         │          │          │ unavailable              │
         ▼          │          ▼                          │
    ┌─────────┐     │     ┌────────┐                      │
    │REVIEWING│◄────┘     │ FAILED │──────────────────────┤
    └────┬────┘           └────────┘                      │
         │                     ▲                          │
         │                     │                          │
    ┌────┴────────────┬───────────────┐                   │
    │                 │               │                   │
    │ score ≥         │ score <       │ max_iter OR       │
    │ threshold       │ threshold     │ stagnant          │
    │                 │ AND improving │                   │
    ▼                 ▼               ▼                   │
┌─────────┐      ┌─────────┐    ┌──────────┐              │
│CONVERGED│      │REVISING │    │ESCALATED │              │
└────┬────┘      └────┬────┘    └─────┬────┘              │
     │                │               │                   │
     │                │               │ Orchestration     │
     │ handoff        │ Alpha         │ decision          │
     │ complete       │ completes     │                   │
     │                │               ├───────────────────┘
     │                │               │
     └────────────────┴───────────────┘
```

### 5.3 Transition Conditions

#### REVIEWING → CONVERGED
- **Condition:** Beta's `quality_score` ≥ `quality_threshold` (set by Orchestration Layer per-task)
- **Action:** Package artifacts, generate final_handoff_archive, transition to IDLE

#### REVIEWING → REVISING
- **Condition:** `quality_score` < `quality_threshold` AND `iteration_count` < `max_iterations` AND `improvement_detected`
- **Action:** Send Beta feedback to Alpha via revise_code, increment iteration_count

#### REVIEWING → ESCALATED
- **Condition:** `iteration_count` ≥ `max_iterations` OR `no_improvement_count` ≥ 2
- **Action:** Package best-effort result with audit trail, await Orchestration Layer instruction

#### Any State → FAILED
- **Condition:** Endpoint unavailable after 10 minutes of exponential backoff retries
- **Action:** Log failure, return error response with partial results if available

### 5.4 Loop Prevention Mechanisms

1. **Hard Iteration Cap:** Maximum iterations configurable per-task (default: 5)
2. **Stagnation Detection:** Track quality_score delta; escalate if |delta| < 2 for 2 consecutive iterations
3. **Oscillation Detection:** Hash revision content; escalate if same hash seen twice
4. **Timeout Guard:** Per-task timeout (configurable, default: 30 minutes) triggers escalation

---

## 6. System Sequence Diagram

The following sequence describes the complete flow from Orchestration Layer request through the Alpha/Beta feedback loop:

```
┌─────────────┐     ┌───────────┐     ┌─────────────┐     ┌────────────┐
│Orchestration│     │MCP Server │     │ Agent Alpha │     │ Agent Beta │
│   Layer     │     │           │     │             │     │            │
└──────┬──────┘     └─────┬─────┘     └──────┬──────┘     └─────┬──────┘
       │                  │                  │                  │
       │ ══════════════════════════════════════════════════════════════
       │ ║           PHASE 1: TASK INITIATION                        ║
       │ ══════════════════════════════════════════════════════════════
       │                  │                  │                  │
       │  execute_task_spec(spec, max=3, threshold=85)          │
       │─────────────────>│                  │                  │
       │                  │                  │                  │
       │                  │ Validate params  │                  │
       │                  │ Create session   │                  │
       │                  │ IDLE→GENERATING  │                  │
       │                  │                  │                  │
       │                  │ Generate(TaskSpec)                  │
       │                  │─────────────────>│                  │
       │                  │                  │                  │
       │                  │    Code artifact │                  │
       │                  │<─────────────────│                  │
       │                  │                  │                  │
       │                  │ Store artifact   │                  │
       │                  │ GENERATING→REVIEWING                │
       │                  │                  │                  │
       │ ══════════════════════════════════════════════════════════════
       │ ║           PHASE 2: REVIEW-REVISE LOOP                     ║
       │ ══════════════════════════════════════════════════════════════
       │                  │                  │                  │
       │                  │    Review(artifact, COMPREHENSIVE)  │
       │                  │────────────────────────────────────>│
       │                  │                  │                  │
       │                  │                  │    Static analysis
       │                  │                  │    Generate tests
       │                  │                  │    Compute score
       │                  │                  │                  │
       │                  │    ReviewFeedback{score:72, defects}│
       │                  │<────────────────────────────────────│
       │                  │                  │                  │
       │                  │ 72 < 85, iter 1 < 3                 │
       │                  │ REVIEWING→REVISING                  │
       │                  │                  │                  │
       │                  │ revise_code(feedback)               │
       │                  │─────────────────>│                  │
       │                  │                  │                  │
       │                  │  Improved artifact                  │
       │                  │<─────────────────│                  │
       │                  │                  │                  │
       │                  │ REVISING→REVIEWING                  │
       │                  │                  │                  │
       │                  │    Review(artifact_v2)              │
       │                  │────────────────────────────────────>│
       │                  │                  │                  │
       │                  │    ReviewFeedback{score:88}         │
       │                  │<────────────────────────────────────│
       │                  │                  │                  │
       │                  │ 88 ≥ 85          │                  │
       │                  │ REVIEWING→CONVERGED                 │
       │                  │                  │                  │
       │ ══════════════════════════════════════════════════════════════
       │ ║           PHASE 3: HANDOFF                                ║
       │ ══════════════════════════════════════════════════════════════
       │                  │                  │                  │
       │   Success{artifact_id, score=88}    │                  │
       │<─────────────────│                  │                  │
       │                  │                  │                  │
       │ final_handoff_archive(session, audit=true)             │
       │─────────────────>│                  │                  │
       │                  │                  │                  │
       │                  │ Package artifacts                   │
       │                  │ + history + tests                   │
       │                  │                  │                  │
       │   HandoffArchive │                  │                  │
       │<─────────────────│                  │                  │
       │                  │                  │                  │
       │                  │ CONVERGED→IDLE   │                  │
       │                  │                  │                  │
       │ ══════════════════════════════════════════════════════════════
       │ ║           SESSION COMPLETE                                ║
       │ ══════════════════════════════════════════════════════════════
```

### Phase Summary

**Phase 1: Task Initiation**
1. Orchestration Layer calls `execute_task_spec` with TaskSpec, max_iterations=3, quality_threshold=85
2. MCP Server validates parameters, creates session, transitions IDLE → GENERATING
3. MCP Server formats prompt from TaskSpec, sends to Agent Alpha endpoint
4. Agent Alpha generates code artifact, returns to MCP Server
5. MCP Server stores artifact, transitions GENERATING → REVIEWING

**Phase 2: Review Loop**
1. MCP Server sends Alpha output to Agent Beta with review_depth=COMPREHENSIVE
2. Agent Beta performs static analysis, generates test suite, computes quality_score
3. Agent Beta returns ReviewFeedback: {quality_score: 72, defects: [...], suggestions: [...]}
4. MCP Server evaluates: 72 < 85 (threshold), iteration 1 < 3 (max) → transition to REVISING
5. MCP Server calls revise_code with Beta feedback, Alpha produces improved artifact
6. Loop continues: Beta reviews (score: 88) → 88 ≥ 85 → transition to CONVERGED

**Phase 3: Handoff**
1. MCP Server packages final artifact with iteration history and Beta's test suite
2. MCP Server returns success response to Orchestration Layer with artifact_id
3. Orchestration Layer calls final_handoff_archive(session_id, include_audit=true)
4. MCP Server returns complete archive, transitions CONVERGED → IDLE

---

## 7. Error Handling Protocols

### 7.1 Endpoint Unavailability

| Scenario | Action | Details |
|----------|--------|---------|
| Transient Failure | Exponential Backoff | Retry at 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s (cap at 256s) for up to 10 minutes total |
| Persistent Failure | Fail and Report | After 10 minutes, transition to FAILED state, return partial results to Orchestration Layer |
| Mid-Task Failure | State Preservation | Save current artifact state; Orchestration Layer can resume or swap endpoint |

### 7.2 Malformed/Dangerous Output

When Agent Alpha produces potentially problematic output:

- **Detection:** Static analysis identifies infinite loops, destructive operations (rm -rf, DROP TABLE), or syntax errors
- **Quarantine:** Output stored but not executed; marked with warning flags
- **Escalation:** Transition to ESCALATED state; report to Orchestration Layer with specific concerns
- **Await Instructions:** Orchestration Layer may respond with "switch LLM", "retry with constraints", or "abort"

### 7.3 Dangerous Pattern Detection

```typescript
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/i,           // Destructive file operations
  /DROP\s+(TABLE|DATABASE)/i,    // SQL destruction
  /DELETE\s+FROM\s+\w+\s*;/i,    // Unbounded deletes
  /while\s*\(\s*true\s*\)/,      // Obvious infinite loops
  /for\s*\(\s*;\s*;\s*\)/,       // Infinite for loops
  /exec\s*\(/,                   // Dynamic code execution
  /eval\s*\(/,                   // Eval usage
];
```

### 7.4 RAG Fallback for Specialized Languages

For lesser-used languages and DSLs where base model knowledge may be insufficient:

- System supports RAG and Agentic RAG reference resources when available
- RAG resources are optional; system degrades gracefully without them
- Orchestration Layer can provide language-specific context via `inject_alternative_pattern`

---

## 8. Phased Implementation Plan

### 8.1 Phase 1: Foundation (Weeks 1-3)

**Objective:** Establish project structure, core infrastructure, and single-agent communication.

| ID | Deliverable | Owner | Est. Hours |
|----|-------------|-------|------------|
| F-1 | TypeScript project scaffolding with MCP SDK | Solo Dev | 4 |
| F-2 | Configuration management (endpoints, prompts, thresholds) | Solo Dev | 6 |
| F-3 | Agent Alpha connector (Ollama, LM Studio, OpenRouter) | Solo Dev | 12 |
| F-4 | Basic execute_task_spec implementation | Solo Dev | 8 |
| F-5 | Local logging infrastructure | Solo Dev | 4 |
| F-6 | Unit test framework setup | Solo Dev | 4 |

**Completion Criteria:** MCP server starts, connects to at least one provider, executes simple generation task.

---

### 8.2 Phase 2: MCP Integration (Weeks 4-6)

**Objective:** Complete MCP tool implementation and Orchestration Layer compatibility.

| ID | Deliverable | Owner | Est. Hours |
|----|-------------|-------|------------|
| M-1 | Context tools: get_repo_map, get_project_status, read_org_policies | Solo Dev | 16 |
| M-2 | Infrastructure tools: configure_endpoint, set_system_prompts | Solo Dev | 8 |
| M-3 | Reporting tools: get_progress_summary, final_handoff_archive | Solo Dev | 10 |
| M-4 | Claude Code integration testing | Solo Dev | 8 |
| M-5 | MS Copilot compatibility verification | Solo Dev | 6 |
| M-6 | Request-response protocol documentation | Solo Dev | 4 |

**Completion Criteria:** All MCP tools callable from Claude Code; documentation complete for Orchestration Layer agents.

---

### 8.3 Phase 3: Logic & Validation Loop (Weeks 7-10)

**Objective:** Implement Agent Beta, review-revise loop, and state machine.

| ID | Deliverable | Owner | Est. Hours |
|----|-------------|-------|------------|
| L-1 | Agent Beta connector and prompt engineering | Solo Dev | 12 |
| L-2 | run_critic_review implementation | Solo Dev | 10 |
| L-3 | generate_test_suite with multi-framework support | Solo Dev | 16 |
| L-4 | State machine implementation | Solo Dev | 12 |
| L-5 | Loop termination logic (iteration cap, stagnation, oscillation) | Solo Dev | 8 |
| L-6 | revise_code and inject_alternative_pattern tools | Solo Dev | 8 |
| L-7 | Quality scoring algorithm | Solo Dev | 6 |

**Completion Criteria:** Full Alpha→Beta→Alpha loop functional; state machine prevents infinite loops; quality metrics collected.

---

### 8.4 Phase 4: Hardening (Weeks 11-14)

**Objective:** Production readiness, error handling, and deployment documentation.

| ID | Deliverable | Owner | Est. Hours |
|----|-------------|-------|------------|
| H-1 | Exponential backoff and retry logic | Solo Dev | 6 |
| H-2 | Dangerous output detection and quarantine | Solo Dev | 10 |
| H-3 | Concurrency handling (≤5 requests) | Solo Dev | 8 |
| H-4 | RAG integration hooks (optional resources) | Solo Dev | 8 |
| H-5 | Team deployment configuration (special mode) | Solo Dev | 6 |
| H-6 | End-to-end integration tests | Solo Dev | 12 |
| H-7 | Deployment and operations documentation | Solo Dev | 8 |

**Completion Criteria:** System handles all error scenarios gracefully; passes stress test with 5 concurrent requests; documentation complete.

---

## 9. Micro-Task Backlog

The following atomic tasks are granular enough to be individually unit-tested. Estimates assume a solo developer familiar with TypeScript and the MCP SDK.

### 9.1 Context Management Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| CM-01 | Implement get_repo_map file system traversal (depth-limited) | 3 | None |
| CM-02 | Add chunking logic for context window constraints (32K-256K) | 4 | CM-01 |
| CM-03 | Implement test file detection and optional inclusion | 2 | CM-01 |
| CM-04 | Create session state data structure | 2 | None |
| CM-05 | Implement get_project_status response formatter | 2 | CM-04 |
| CM-06 | Create policy schema (style, security, custom) | 3 | None |
| CM-07 | Implement read_org_policies file loader | 2 | CM-06 |
| CM-08 | Add OWASP baseline security policy defaults | 3 | CM-06 |

### 9.2 Development Loop Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| DL-01 | Define TaskSpec interface and validation schema | 2 | None |
| DL-02 | Implement execute_task_spec parameter parsing | 2 | DL-01 |
| DL-03 | Create prompt formatter for Agent Alpha | 3 | DL-01 |
| DL-04 | Implement Alpha response parser and artifact storage | 3 | DL-03 |
| DL-05 | Define ReviewFeedback interface | 1 | None |
| DL-06 | Implement revise_code feedback injection | 3 | DL-05 |
| DL-07 | Define CodePattern interface for alternatives | 2 | None |
| DL-08 | Implement inject_alternative_pattern logic | 3 | DL-07 |

### 9.3 Validation Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| VL-01 | Create Agent Beta prompt template | 3 | None |
| VL-02 | Implement run_critic_review orchestration | 4 | VL-01 |
| VL-03 | Implement quality_score calculation algorithm | 4 | VL-02 |
| VL-04 | Add defect classification (severity, category) | 3 | VL-02 |
| VL-05 | Implement Python/pytest test generation | 4 | VL-01 |
| VL-06 | Implement JavaScript/Jest test generation | 4 | VL-01 |
| VL-07 | Implement Go test generation | 3 | VL-01 |
| VL-08 | Implement Rust test generation | 3 | VL-01 |
| VL-09 | Add coverage target validation | 2 | VL-05 |

### 9.4 Infrastructure Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| IN-01 | Define ProviderConfig schema (Ollama, LM Studio, OpenRouter) | 2 | None |
| IN-02 | Implement Ollama connector | 4 | IN-01 |
| IN-03 | Implement LM Studio connector | 4 | IN-01 |
| IN-04 | Implement OpenRouter connector | 4 | IN-01 |
| IN-05 | Implement configure_endpoint runtime swap | 3 | IN-02,03,04 |
| IN-06 | Add endpoint health check mechanism | 2 | IN-05 |
| IN-07 | Define SystemPromptConfig schema | 1 | None |
| IN-08 | Implement set_system_prompts persistence | 2 | IN-07 |

### 9.5 State Machine Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| SM-01 | Define state enum (IDLE, GENERATING, REVIEWING, etc.) | 1 | None |
| SM-02 | Implement state transition validator | 3 | SM-01 |
| SM-03 | Implement iteration counter with max cap | 2 | SM-01 |
| SM-04 | Implement stagnation detection (delta < 2 for 2 iterations) | 3 | SM-03 |
| SM-05 | Implement oscillation detection (content hash comparison) | 3 | SM-03 |
| SM-06 | Implement per-task timeout guard | 2 | SM-01 |
| SM-07 | Implement ESCALATED state handler | 3 | SM-02 |
| SM-08 | Implement FAILED state cleanup | 2 | SM-02 |

### 9.6 Reporting Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| RP-01 | Define ProgressSummary response schema | 1 | None |
| RP-02 | Implement get_progress_summary aggregation | 3 | RP-01 |
| RP-03 | Define HandoffArchive schema | 2 | None |
| RP-04 | Implement artifact packaging for handoff | 3 | RP-03 |
| RP-05 | Implement audit trail inclusion (optional) | 3 | RP-04 |
| RP-06 | Add local file logging with rotation | 3 | None |

### 9.7 Error Handling Tasks

| ID | Task Description | Est. Hours | Dependencies |
|----|------------------|------------|--------------|
| EH-01 | Implement exponential backoff utility | 2 | None |
| EH-02 | Add 10-minute timeout ceiling for retries | 1 | EH-01 |
| EH-03 | Implement dangerous pattern detector (rm -rf, DROP, etc.) | 4 | None |
| EH-04 | Implement infinite loop detection heuristics | 3 | None |
| EH-05 | Implement output quarantine storage | 2 | EH-03,04 |
| EH-06 | Implement Orchestration Layer escalation message format | 2 | EH-05 |

---

## 10. Effort Summary

| Phase | Estimated Hours | Weeks (40hr/wk) |
|-------|-----------------|-----------------|
| Phase 1: Foundation | 38 | ~1 |
| Phase 2: MCP Integration | 52 | ~1.5 |
| Phase 3: Logic & Validation | 72 | ~2 |
| Phase 4: Hardening | 58 | ~1.5 |
| **TOTAL** | **220** | **~6** |

**Note:** Estimates assume a solo developer with TypeScript and MCP SDK familiarity. Add 20-30% buffer for learning curve, debugging, and unforeseen complexities. Total calendar time estimated at 10-14 weeks including buffer.

---

## Appendices

### Appendix A: Supported Test Frameworks

| Language | Framework | Notes |
|----------|-----------|-------|
| Python | pytest | Primary support; fixtures and parametrize |
| Go | testing | Standard library testing package |
| Rust | #[test] | Built-in test attribute |
| C/C++ | Google Test | Requires gtest installation |
| JavaScript | Jest | Primary support; mocking included |
| Angular | Jasmine/Karma | Angular CLI test runner |
| Java | JUnit 5 | Modern JUnit with extensions |
| SQL | pgTAP/tSQLt | Database-specific; optional |

### Appendix B: Configuration Schema

The MCP server configuration file (config.json) supports the following structure:

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

interface ProviderConfig {
  type: 'ollama' | 'lmstudio' | 'openrouter';
  base_url: string;
  model: string;
  api_key?: string;  // Required for OpenRouter
  context_window?: number;
}
```

### Appendix C: State Transition Quick Reference

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
| ESCALATED | REVISING | Orchestration: retry |
| ESCALATED | IDLE | Orchestration: abort |
| ESCALATED | FAILED | Timeout or explicit fail |
| CONVERGED | IDLE | Handoff complete |
| FAILED | IDLE | Error acknowledged |

### Appendix D: TypeScript Interface Definitions

```typescript
// Core Types
type AgentType = 'alpha' | 'beta';
type ProviderType = 'ollama' | 'lmstudio' | 'openrouter';
type PolicyType = 'style' | 'security' | 'custom';
type ReviewDepth = 'quick' | 'standard' | 'comprehensive';
type Verbosity = 'minimal' | 'standard' | 'detailed';

type TestFramework = 
  | 'pytest' | 'jest' | 'go_testing' | 'rust_test'
  | 'gtest' | 'junit5' | 'jasmine' | 'pgtap';

enum StateMachineState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  REVIEWING = 'REVIEWING',
  REVISING = 'REVISING',
  CONVERGED = 'CONVERGED',
  ESCALATED = 'ESCALATED',
  FAILED = 'FAILED'
}

// Task Specification
interface TaskSpec {
  description: string;
  language: string;
  context_files?: string[];
  constraints?: string[];
  examples?: CodeExample[];
}

// Review Feedback
interface ReviewFeedback {
  quality_score: number;
  defects: Defect[];
  suggestions: string[];
  required_changes: string[];
}

interface Defect {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  location: string;
  description: string;
  suggested_fix?: string;
}

// Escalation
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

*Document Version: 1.0 | January 2026*

*— End of Document —*
