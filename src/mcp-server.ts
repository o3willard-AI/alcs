#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer } from 'http';
import { logger } from './services/loggerService.js';
import { ALL_TOOLS, TOOL_HANDLERS } from './mcp/tools.js';
import { metricsService } from './services/metricsService.js';
import { health_check } from './tools/healthCheck.js';
import { dbService } from './services/databaseService.js';
import { authService } from './services/authService.js';
import { rateLimitService, extractRateLimitIdentifier, addRateLimitHeaders } from './services/rateLimitService.js';
import { validationService } from './services/validationService.js';
import { cacheService, CacheKeys } from './services/cacheService.js';

/**
 * ALCS MCP Server
 *
 * This server exposes the Dual-Agent Local Coding Service tools via the Model Context Protocol,
 * allowing high-reasoning AI models (Claude, Gemini, Copilot) to delegate coding tasks to
 * specialized local LLM agents.
 */

// Server metadata
const SERVER_NAME = 'alcs';
const SERVER_VERSION = '1.0.0';

// Track in-flight requests for graceful shutdown
let inFlightRequests = 0;
let isShuttingDown = false;

/**
 * Initialize the MCP server
 */
async function main() {
  logger.info(`Starting ALCS MCP Server v${SERVER_VERSION}`);

  // Initialize test runners
  const { registerAllTestRunners, logTestToolAvailability } = await import('./services/testRunnerRegistry.js');
  await registerAllTestRunners();
  await logTestToolAvailability();

  // Initialize static analyzers
  const { registerAllAnalyzers, logAnalyzerAvailability } = await import('./services/staticAnalysisRegistry.js');
  await registerAllAnalyzers();
  await logAnalyzerAvailability();

  logger.info(`Registering ${ALL_TOOLS.length} MCP tools`);

  // Create the server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const requestId = Date.now().toString(36);
    logger.info(`[${requestId}] Received ListTools request`);

    inFlightRequests++;
    try {
      const result = { tools: ALL_TOOLS };
      logger.info(`[${requestId}] ListTools request completed (${ALL_TOOLS.length} tools)`);
      return result;
    } finally {
      inFlightRequests--;
    }
  });

  // Handler for executing tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const requestId = Date.now().toString(36);

    logger.info(`[${requestId}] Received CallTool request for: ${name}`);
    logger.debug(`[${requestId}] Arguments: ${JSON.stringify(args, null, 2)}`);

    inFlightRequests++;
    const startTime = Date.now();

    try {
      // Get the appropriate tool handler
      const handler = TOOL_HANDLERS[name as keyof typeof TOOL_HANDLERS] as any;

      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Validate tool arguments
      const validationResult = validationService.validateToolArgs(name, args);
      if (!validationResult.valid) {
        const errorDetails = validationResult.errors?.map(e =>
          `${e.field}: ${e.message}`
        ).join(', ');

        logger.warn(`[${requestId}] Validation failed for tool ${name}: ${errorDetails}`);
        metricsService.recordError('tool_validation_failed', 'medium');

        throw new Error(`Invalid arguments: ${errorDetails}`);
      }

      // Use sanitized arguments
      const sanitizedArgs = validationResult.sanitized || args;

      // Execute the tool with provided arguments
      let result;

      // Route to appropriate handler based on tool name (use sanitizedArgs)
      switch (name) {
        case 'execute_task_spec':
          result = await handler(sanitizedArgs);
          break;

        case 'run_critic_review':
          result = await handler(sanitizedArgs.session_id, {
            artifact_id: sanitizedArgs.artifact_id,
            review_depth: sanitizedArgs.review_depth || 'standard'
          });
          break;

        case 'revise_code':
          result = await handler({
            artifact_id: sanitizedArgs.artifact_id,
            feedback: sanitizedArgs.feedback
          });
          break;

        case 'get_repo_map':
          result = await handler({
            repo_path: sanitizedArgs.repo_path,
            include_tests: sanitizedArgs.include_tests ?? true
          });
          break;

        case 'get_project_status':
          result = await handler({
            session_id: sanitizedArgs.session_id
          });
          break;

        case 'read_org_policies':
          result = await handler({
            policy_type: sanitizedArgs.policy_type
          });
          break;

        case 'configure_endpoint':
          result = await handler({
            agent_type: sanitizedArgs.agent_type,
            provider_config: sanitizedArgs.provider_config
          });
          break;

        case 'set_system_prompts':
          result = await handler({
            agent_type: sanitizedArgs.agent_type,
            new_prompts: sanitizedArgs.prompts
          });
          break;

        case 'get_progress_summary':
          result = await handler({
            session_id: sanitizedArgs.session_id
          });
          break;

        case 'final_handoff_archive':
          result = await handler({
            session_id: sanitizedArgs.session_id
          });
          break;

        case 'generate_test_suite':
          result = await handler({
            artifact_id: sanitizedArgs.artifact_id,
            framework: sanitizedArgs.test_framework,
            coverage_target: sanitizedArgs.coverage_target || 80
          });
          break;

        case 'inject_alternative_pattern':
          result = await handler({
            pattern: sanitizedArgs.pattern,
            context: sanitizedArgs.context
          });
          break;

        case 'health_check':
          result = await handler();
          break;

        default:
          throw new Error(`Tool ${name} handler not implemented`);
      }

      const duration = Date.now() - startTime;
      logger.info(`[${requestId}] Successfully executed tool: ${name} (${duration}ms)`);
      logger.debug(`[${requestId}] Result: ${JSON.stringify(result, null, 2)}`);

      // Record successful MCP request metric
      metricsService.recordMCPRequest(name, 'success');

      // Return result in MCP format
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`[${requestId}] Error executing tool ${name} (${duration}ms): ${error.message}`);
      logger.error(`[${requestId}] Stack trace: ${error.stack}`);

      // Record failed MCP request metric
      metricsService.recordMCPRequest(name, 'error');
      metricsService.recordError('mcp_tool_execution', 'high');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.message,
              tool: name
            }, null, 2)
          }
        ],
        isError: true
      };
    } finally {
      inFlightRequests--;
    }
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  logger.info('ALCS MCP Server started successfully on stdio transport');

  // Start HTTP server for metrics and health checks if enabled
  const enableMetrics = process.env.ENABLE_METRICS === 'true';
  const metricsPort = parseInt(process.env.METRICS_PORT || '9090', 10);

  if (enableMetrics) {
    const httpServer = createServer(async (req, res) => {
      const url = req.url || '/';

      try {
        // Authenticate request if authentication is enabled
        const authHeader = req.headers['authorization'];
        const authContext = await authService.authenticate(authHeader);

        // Public endpoints (no auth required) - metrics endpoint for Prometheus scraping
        const publicEndpoints = ['/metrics'];
        const isPublicEndpoint = publicEndpoints.includes(url);

        // Check authentication for protected endpoints
        if (authService.isEnabled() && !isPublicEndpoint && !authContext.authenticated) {
          logger.warn(`Unauthorized access attempt to ${url}`);
          res.setHeader('WWW-Authenticate', 'Bearer realm="ALCS", charset="UTF-8"');
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid authentication required' }));
          return;
        }

        // Apply rate limiting
        const rateLimitIdentifier = extractRateLimitIdentifier(req, authContext);
        const rateLimitResult = rateLimitService.checkLimit(rateLimitIdentifier, 'http');

        // Add rate limit headers to response
        addRateLimitHeaders(res, rateLimitResult);

        // Check if rate limit exceeded
        if (!rateLimitResult.allowed) {
          logger.warn(`Rate limit exceeded for ${rateLimitIdentifier} on ${url}`);
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(429);
          res.end(JSON.stringify({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
            limit: rateLimitResult.limit,
            retryAfter: rateLimitResult.retryAfter,
          }));
          return;
        }

        if (url === '/metrics') {
          // Prometheus metrics endpoint (public)
          res.setHeader('Content-Type', metricsService.getContentType());
          res.writeHead(200);
          res.end(await metricsService.getMetrics());
        } else if (url === '/health') {
          // Health check endpoint (protected, cached for 30 seconds)
          const healthResult = await cacheService.getOrSet(
            CacheKeys.health(),
            () => health_check(),
            30 // 30 seconds TTL
          );

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache', healthResult === await cacheService.get(CacheKeys.health()) ? 'HIT' : 'MISS');
          res.writeHead(healthResult.status === 'healthy' ? 200 : 503);
          res.end(JSON.stringify(healthResult, null, 2));
        } else if (url === '/ready') {
          // Readiness probe (protected)
          try {
            const isHealthy = await dbService.healthCheck();
            res.setHeader('Content-Type', 'application/json');
            if (isHealthy) {
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'ready' }));
            } else {
              res.writeHead(503);
              res.end(JSON.stringify({ status: 'not ready', error: 'Database health check failed' }));
            }
          } catch (error: any) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(503);
            res.end(JSON.stringify({ status: 'not ready', error: error.message }));
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (error: any) {
        logger.error(`Error handling HTTP request ${url}: ${error.message}`);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    httpServer.listen(metricsPort, () => {
      logger.info(`Metrics server listening on port ${metricsPort}`);
      logger.info(`  - GET /metrics - Prometheus metrics`);
      logger.info(`  - GET /health  - Health check`);
      logger.info(`  - GET /ready   - Readiness probe`);
    });
  }

  /**
   * Graceful shutdown handler
   * Waits for in-flight requests to complete before shutting down
   */
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Already shutting down, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    logger.info(`Current in-flight requests: ${inFlightRequests}`);

    // Wait for in-flight requests to complete (max 30 seconds)
    const shutdownTimeout = 30000;
    const startTime = Date.now();

    while (inFlightRequests > 0 && Date.now() - startTime < shutdownTimeout) {
      logger.info(`Waiting for ${inFlightRequests} in-flight request(s) to complete...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (inFlightRequests > 0) {
      logger.warn(`Forcing shutdown with ${inFlightRequests} in-flight request(s) remaining`);
    } else {
      logger.info('All in-flight requests completed');
    }

    logger.info('Closing MCP server...');
    await server.close();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  // Register shutdown handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start the server
main().catch((error) => {
  logger.error(`Fatal error starting MCP server: ${error.message}`);
  console.error('Fatal error:', error);
  process.exit(1);
});
