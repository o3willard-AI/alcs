// src/types/mcp.ts

export interface CodeExample {
  description: string;
  code: string;
  language: string;
}

export interface TaskSpec {
  description: string;
  language: string;
  context_files?: string[];
  constraints?: string[];
  examples?: CodeExample[];
}

export enum StateMachineState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  REVIEWING = 'REVIEWING',
  REVISING = 'REVISING',
  CONVERGED = 'CONVERGED',
  ESCALATED = 'ESCALATED',
  FAILED = 'FAILED'
}

export interface Artifact {
  id: string;
  type: 'code' | 'test_suite' | 'review' | 'log' | 'audit_trail';
  description: string;
  timestamp: number;
  content?: string; // Content of the artifact, e.g., code, test, log content
  metadata?: Record<string, any>;
}


export interface SessionState {
  session_id: string;
  state: StateMachineState;
  current_iteration: number;
  max_iterations: number;
  quality_threshold: number;
  last_quality_score?: number;
  artifacts: Artifact[];
  elapsed_time_ms: number;
  score_history: number[];
  content_hashes: Set<string>;
  start_time: number;
  task_timeout_minutes: number; // Added for L-5
  time_per_iteration_ms?: number[]; // Added for RP-02
}

// Interfaces for get_repo_map tool
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[]; // For directories
  size?: number; // In bytes
  total_tokens_estimated?: number; // Added for CM-02
}

export interface GetRepoMapParams {
  path: string;
  depth?: number;
  include_tests?: boolean;
}

export interface GetRepoMapResponse {
  structure: FileNode[];
  total_files: number;
  total_tokens_estimated: number; // Added for CM-02
}

// Interfaces for read_org_policies tool (CM-07)
export type PolicyType = 'style' | 'security' | 'custom';

export interface PolicyRule {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  pattern?: string; // Regex or specific pattern to check
}

export interface ReadOrgPoliciesParams {
  policy_type: PolicyType;
}

export interface ReadOrgPoliciesResponse {
  policy_type: PolicyType;
  rules: PolicyRule[];
  source: 'file' | 'default';
}

// Interfaces for configure_endpoint tool (IN-05)
export type AgentType = 'alpha' | 'beta';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unreachable';
  message?: string;
  responseTimeMs?: number;
}

export interface ConfigureEndpointParams {
  agent: AgentType;
  provider: import("../types/config").ProviderConfig; // Use import() for circular dependency if needed
}

export interface ConfigureEndpointResponse {
  success: boolean;
  health_check: HealthCheckResult;
  previous_config?: import("../types/config").ProviderConfig; // Use import()
}

// Interfaces for set_system_prompts tool (IN-08)
export interface SystemPromptConfig {
  base_prompt: string;
  task_prefix?: string;
  constraints?: string[];
  output_format?: string;
}

export interface SetSystemPromptsParams {
  agent: AgentType;
  prompts: SystemPromptConfig;
}

export interface SetSystemPromptsResponse {
  success: boolean;
  message?: string;
  previous_prompts?: SystemPromptConfig;
}

// Interfaces for get_progress_summary tool (RP-02)
export type Verbosity = 'minimal' | 'standard' | 'detailed';
export type ConvergenceTrend = 'improving' | 'stagnant' | 'oscillating' | 'insufficient_data';

export interface GetProgressSummaryParams {
  session_id: string;
  verbosity?: Verbosity;
}

export interface GetProgressSummaryResponse {
  session_id: string;
  iterations_completed: number;
  quality_scores: number[];
  time_per_iteration_ms: number[];
  current_state: StateMachineState;
  convergence_trend: ConvergenceTrend;
}

// Interfaces for final_handoff_archive tool (RP-04)
export interface AuditEntry {
  timestamp: number;
  event: string; // e.g., 'session_start', 'generation_complete', 'review_received'
  details: Record<string, any>;
}

export interface FinalHandoffArchiveParams {
  session_id: string;
  include_audit?: boolean;
}

export interface FinalHandoffArchiveResponse {
  archive_id: string;
  session_id: string;
  final_artifact?: Artifact;
  test_suite?: Artifact;
  final_quality_score: number;
  total_iterations: number;
  audit_trail?: AuditEntry[];
  recommendations?: string[];
}

// Interfaces for Agent Beta (L-1)
export interface Defect {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  location: string; // e.g., 'line 42', 'function calculateTotal'
  description: string;
  suggested_fix?: string;
}

export interface ReviewFeedback {
  quality_score: number; // 0-100
  defects: Defect[];
  suggestions: string[];
  required_changes: string[];
}

// Interfaces for run_critic_review tool (L-2)
export type ReviewDepth = 'quick' | 'standard' | 'comprehensive';

export interface RunCriticReviewParams {
  artifact_id: string;
  review_depth: ReviewDepth;
}

export interface RunCriticReviewResponse {
  review_id: string;
  quality_score: number;
  defects: Defect[];
  test_coverage_estimate: number;
  policy_violations: PolicyRule[];
  suggestions: string[];
  recommendation: 'approve' | 'revise' | 'escalate';
  required_changes: string[]; // Added this property
}

// Interfaces for generate_test_suite tool (L-3)
export type TestFramework =
  | 'pytest' | 'jest' | 'go_testing' | 'rust_test'
  | 'gtest' | 'junit5' | 'jasmine' | 'pgtap';

export interface GenerateTestSuiteParams {
  artifact_id: string;
  framework: TestFramework;
  coverage_target?: number;
}

export interface GenerateTestSuiteResponse {
  test_artifact_id: string;
  test_count: number;
  estimated_coverage: number;
  test_code: string;
}

// Interfaces for revise_code and inject_alternative_pattern tools (L-6)
export interface ReviseCodeParams {
  session_id?: string;
  artifact_id: string;
  feedback: ReviewFeedback;
}

export interface CodePattern {
  name: string;
  description: string;
  template: string;
  examples?: string[];
}

export interface InjectAlternativePatternParams {
  pattern: CodePattern;
  context: string;
}

// Interfaces for loop termination logic (L-5)
export interface LoopGuardConfig {
  stagnationThreshold: number;
  stagnationWindow: number;
  oscillationDetection: boolean;
}

// Interfaces for escalation handler (SM-07)
export type EscalationReason =
  | 'max_iterations_reached'
  | 'stagnation_detected'
  | 'oscillation_detected'
  | 'timeout_exceeded'
  | 'dangerous_output_detected';

export type EscalationAction =
  | { type: 'switch_llm'; target_agent: AgentType; suggested_model?: string }
  | { type: 'retry_with_constraints'; additional_constraints: string[] }
  | { type: 'abort' }
  | { type: 'accept_best_effort' };

export interface EscalationMessage {
  session_id: string;
  reason: EscalationReason;
  best_artifact: Artifact;
  iteration_history: { iteration: number; score: number; artifact_id: string }[];
  final_critique: ReviewFeedback;
  available_actions: EscalationAction[];
}

// Interfaces for Test Execution (Phase 3)
export interface TestFailure {
  test_name: string;
  error_message: string;
  stack_trace: string;
  location: string; // file:line
}

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

export interface TestExecutionOptions {
  timeout_seconds?: number;
  memory_limit_mb?: number;
  cpu_limit?: number;
  enable_network?: boolean;
}

export interface CoverageReport {
  line_coverage: number;      // Percentage (0-100)
  branch_coverage: number;    // Percentage (0-100)
  function_coverage: number;  // Percentage (0-100)
  lines_covered: number;
  lines_total: number;
  uncovered_lines: number[];  // Line numbers
}

// Interfaces for Static Analysis (Phase 3)
export interface StaticAnalysisViolation {
  rule_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location: string;
  line: number;
  column?: number;
  suggested_fix?: string;
}

export interface StaticAnalysisResult {
  violations: StaticAnalysisViolation[];
  total_violations: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}