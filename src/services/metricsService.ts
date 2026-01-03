/**
 * Metrics Service
 *
 * Provides Prometheus metrics for monitoring ALCS performance and health.
 * Exposes metrics via /metrics endpoint for Prometheus scraping.
 */

import { register, Registry, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './loggerService';

export class MetricsService {
  private registry: Registry;

  // Session Metrics
  public sessionsTotal: Counter;
  public sessionsActive: Gauge;
  public sessionsConverged: Counter;
  public sessionsEscalated: Counter;
  public sessionsStagnant: Gauge;
  public sessionDuration: Histogram;
  public iterationsPerSession: Histogram;

  // Quality Metrics
  public qualityScore: Gauge;
  public qualityScoreHistogram: Histogram;

  // Test Execution Metrics
  public testExecutionsTotal: Counter;
  public testExecutionsFailed: Counter;
  public testExecutionDuration: Histogram;
  public testCoverage: Histogram;

  // Static Analysis Metrics
  public staticAnalysisTotal: Counter;
  public staticAnalysisFailed: Counter;
  public staticAnalysisDuration: Histogram;
  public staticAnalysisViolations: Counter;

  // LLM Request Metrics
  public llmRequestsTotal: Counter;
  public llmRequestDuration: Histogram;
  public llmEndpointUp: Gauge;
  public llmTokensUsed: Counter;

  // Error Metrics
  public errorsTotal: Counter;

  // System Metrics
  public requestsTotal: Counter;
  public dockerContainerFailures: Counter;

  // Database Metrics
  public databasePoolConnectionsInUse: Gauge;
  public databasePoolConnectionsMax: Gauge;
  public databaseQueryDuration: Histogram;

  constructor() {
    this.registry = register;

    // Session Metrics
    this.sessionsTotal = new Counter({
      name: 'alcs_sessions_total',
      help: 'Total number of coding sessions started',
      labelNames: ['language'],
      registers: [this.registry]
    });

    this.sessionsActive = new Gauge({
      name: 'alcs_sessions_active',
      help: 'Number of currently active sessions',
      registers: [this.registry]
    });

    this.sessionsConverged = new Counter({
      name: 'alcs_sessions_converged_total',
      help: 'Total number of sessions that converged successfully',
      labelNames: ['language'],
      registers: [this.registry]
    });

    this.sessionsEscalated = new Counter({
      name: 'alcs_sessions_escalated_total',
      help: 'Total number of sessions that were escalated',
      labelNames: ['language', 'reason'],
      registers: [this.registry]
    });

    this.sessionsStagnant = new Gauge({
      name: 'alcs_sessions_stagnant_total',
      help: 'Number of sessions currently stagnant',
      registers: [this.registry]
    });

    this.sessionDuration = new Histogram({
      name: 'alcs_session_duration_seconds',
      help: 'Duration of coding sessions in seconds',
      labelNames: ['language', 'outcome'],
      buckets: [30, 60, 120, 300, 600, 1200, 1800, 3600], // 30s to 1h
      registers: [this.registry]
    });

    this.iterationsPerSession = new Histogram({
      name: 'alcs_iterations_per_session',
      help: 'Number of iterations per session',
      labelNames: ['language', 'outcome'],
      buckets: [1, 2, 3, 4, 5, 7, 10],
      registers: [this.registry]
    });

    // Quality Metrics
    this.qualityScore = new Gauge({
      name: 'alcs_quality_score',
      help: 'Current quality score of sessions',
      labelNames: ['session_id', 'language'],
      registers: [this.registry]
    });

    this.qualityScoreHistogram = new Histogram({
      name: 'alcs_quality_score_distribution',
      help: 'Distribution of quality scores',
      labelNames: ['language'],
      buckets: [0, 40, 50, 60, 70, 80, 90, 100],
      registers: [this.registry]
    });

    // Test Execution Metrics
    this.testExecutionsTotal = new Counter({
      name: 'alcs_test_executions_total',
      help: 'Total number of test executions',
      labelNames: ['framework', 'language'],
      registers: [this.registry]
    });

    this.testExecutionsFailed = new Counter({
      name: 'alcs_test_executions_failed_total',
      help: 'Total number of failed test executions',
      labelNames: ['framework', 'language', 'reason'],
      registers: [this.registry]
    });

    this.testExecutionDuration = new Histogram({
      name: 'alcs_test_execution_duration_seconds',
      help: 'Duration of test executions in seconds',
      labelNames: ['framework', 'language'],
      buckets: [1, 5, 10, 20, 30, 60, 120, 300],
      registers: [this.registry]
    });

    this.testCoverage = new Histogram({
      name: 'alcs_test_coverage_percentage',
      help: 'Test coverage percentage',
      labelNames: ['framework', 'language'],
      buckets: [0, 20, 40, 60, 70, 80, 90, 100],
      registers: [this.registry]
    });

    // Static Analysis Metrics
    this.staticAnalysisTotal = new Counter({
      name: 'alcs_static_analysis_total',
      help: 'Total number of static analysis runs',
      labelNames: ['analyzer', 'language'],
      registers: [this.registry]
    });

    this.staticAnalysisFailed = new Counter({
      name: 'alcs_static_analysis_failed_total',
      help: 'Total number of failed static analysis runs',
      labelNames: ['analyzer', 'language', 'reason'],
      registers: [this.registry]
    });

    this.staticAnalysisDuration = new Histogram({
      name: 'alcs_static_analysis_duration_seconds',
      help: 'Duration of static analysis in seconds',
      labelNames: ['analyzer', 'language'],
      buckets: [0.5, 1, 2, 5, 10, 20, 30],
      registers: [this.registry]
    });

    this.staticAnalysisViolations = new Counter({
      name: 'alcs_static_analysis_violations_total',
      help: 'Total number of static analysis violations found',
      labelNames: ['analyzer', 'language', 'severity'],
      registers: [this.registry]
    });

    // LLM Request Metrics
    this.llmRequestsTotal = new Counter({
      name: 'alcs_llm_requests_total',
      help: 'Total number of LLM requests',
      labelNames: ['provider', 'model', 'agent'],
      registers: [this.registry]
    });

    this.llmRequestDuration = new Histogram({
      name: 'alcs_llm_request_duration_seconds',
      help: 'Duration of LLM requests in seconds',
      labelNames: ['provider', 'model', 'agent'],
      buckets: [1, 2, 5, 10, 20, 30, 60],
      registers: [this.registry]
    });

    this.llmEndpointUp = new Gauge({
      name: 'alcs_llm_endpoint_up',
      help: 'LLM endpoint availability (1 = up, 0 = down)',
      labelNames: ['provider'],
      registers: [this.registry]
    });

    this.llmTokensUsed = new Counter({
      name: 'alcs_llm_tokens_used_total',
      help: 'Total number of LLM tokens used',
      labelNames: ['provider', 'model', 'type'], // type: input/output
      registers: [this.registry]
    });

    // Error Metrics
    this.errorsTotal = new Counter({
      name: 'alcs_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'severity'],
      registers: [this.registry]
    });

    // System Metrics
    this.requestsTotal = new Counter({
      name: 'alcs_requests_total',
      help: 'Total number of MCP requests',
      labelNames: ['tool', 'status'], // status: success/error
      registers: [this.registry]
    });

    this.dockerContainerFailures = new Counter({
      name: 'alcs_docker_container_failures_total',
      help: 'Total number of Docker container failures',
      labelNames: ['reason'],
      registers: [this.registry]
    });

    // Database Metrics
    this.databasePoolConnectionsInUse = new Gauge({
      name: 'alcs_database_pool_connections_in_use',
      help: 'Number of database connections currently in use',
      registers: [this.registry]
    });

    this.databasePoolConnectionsMax = new Gauge({
      name: 'alcs_database_pool_connections_max',
      help: 'Maximum number of database connections',
      registers: [this.registry]
    });

    this.databaseQueryDuration = new Histogram({
      name: 'alcs_database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation'], // operation: select/insert/update/delete
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry]
    });

    logger.info('MetricsService initialized with Prometheus metrics');
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get content type for metrics endpoint
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Record session start
   */
  recordSessionStart(language: string): void {
    this.sessionsTotal.inc({ language });
    this.sessionsActive.inc();
  }

  /**
   * Record session end
   */
  recordSessionEnd(
    language: string,
    outcome: 'converged' | 'escalated',
    durationSeconds: number,
    iterations: number,
    finalQualityScore: number
  ): void {
    this.sessionsActive.dec();

    if (outcome === 'converged') {
      this.sessionsConverged.inc({ language });
    } else {
      this.sessionsEscalated.inc({ language, reason: 'max_iterations' });
    }

    this.sessionDuration.observe({ language, outcome }, durationSeconds);
    this.iterationsPerSession.observe({ language, outcome }, iterations);
    this.qualityScoreHistogram.observe({ language }, finalQualityScore);
  }

  /**
   * Record quality score
   */
  recordQualityScore(sessionId: string, language: string, score: number): void {
    this.qualityScore.set({ session_id: sessionId, language }, score);
  }

  /**
   * Record test execution
   */
  recordTestExecution(
    framework: string,
    language: string,
    durationSeconds: number,
    coverage: number,
    success: boolean,
    failureReason?: string
  ): void {
    this.testExecutionsTotal.inc({ framework, language });

    if (!success && failureReason) {
      this.testExecutionsFailed.inc({ framework, language, reason: failureReason });
    }

    this.testExecutionDuration.observe({ framework, language }, durationSeconds);
    this.testCoverage.observe({ framework, language }, coverage);
  }

  /**
   * Record static analysis
   */
  recordStaticAnalysis(
    analyzer: string,
    language: string,
    durationSeconds: number,
    violations: { severity: string }[],
    success: boolean,
    failureReason?: string
  ): void {
    this.staticAnalysisTotal.inc({ analyzer, language });

    if (!success && failureReason) {
      this.staticAnalysisFailed.inc({ analyzer, language, reason: failureReason });
    }

    this.staticAnalysisDuration.observe({ analyzer, language }, durationSeconds);

    // Count violations by severity
    for (const violation of violations) {
      this.staticAnalysisViolations.inc({
        analyzer,
        language,
        severity: violation.severity
      });
    }
  }

  /**
   * Record LLM request
   */
  recordLLMRequest(
    provider: string,
    model: string,
    agent: string,
    durationSeconds: number,
    tokensInput: number,
    tokensOutput: number
  ): void {
    this.llmRequestsTotal.inc({ provider, model, agent });
    this.llmRequestDuration.observe({ provider, model, agent }, durationSeconds);
    this.llmTokensUsed.inc({ provider, model, type: 'input' }, tokensInput);
    this.llmTokensUsed.inc({ provider, model, type: 'output' }, tokensOutput);
  }

  /**
   * Update LLM endpoint status
   */
  setLLMEndpointStatus(provider: string, isUp: boolean): void {
    this.llmEndpointUp.set({ provider }, isUp ? 1 : 0);
  }

  /**
   * Record error
   */
  recordError(type: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    this.errorsTotal.inc({ type, severity });
  }

  /**
   * Record MCP request
   */
  recordMCPRequest(tool: string, status: 'success' | 'error'): void {
    this.requestsTotal.inc({ tool, status });
  }

  /**
   * Record Docker container failure
   */
  recordDockerFailure(reason: string): void {
    this.dockerContainerFailures.inc({ reason });
  }

  /**
   * Update database pool metrics
   */
  updateDatabasePoolMetrics(inUse: number, max: number): void {
    this.databasePoolConnectionsInUse.set(inUse);
    this.databasePoolConnectionsMax.set(max);
  }

  /**
   * Record database query
   */
  recordDatabaseQuery(operation: string, durationSeconds: number): void {
    this.databaseQueryDuration.observe({ operation }, durationSeconds);
  }
}

// Singleton instance
export const metricsService = new MetricsService();
