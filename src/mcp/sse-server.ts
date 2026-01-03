/**
 * SSE Transport Server for ALCS MCP
 *
 * This module provides an HTTP Server-Sent Events transport for the MCP server,
 * allowing web-based AI tools to connect to ALCS.
 */

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../services/loggerService.js';
import { ALL_TOOLS, TOOL_HANDLERS } from './tools.js';

const SERVER_NAME = 'alcs';
const SERVER_VERSION = '1.0.0';
const DEFAULT_PORT = 3000;

/**
 * Create and configure the MCP server with SSE transport
 */
export async function startSSEServer(port: number = DEFAULT_PORT) {
  logger.info(`Starting ALCS MCP Server with SSE transport v${SERVER_VERSION}`);
  logger.info(`Server will listen on port ${port}`);

  // Create Express app
  const app = express();

  // Enable CORS for web clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Parse JSON bodies
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      server: SERVER_NAME,
      version: SERVER_VERSION,
      transport: 'sse',
      tools_count: ALL_TOOLS.length
    });
  });

  // SSE endpoint for MCP
  app.get('/sse', async (req, res) => {
    logger.info('New SSE connection established');

    // Create MCP server instance for this connection
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

    // Register tool list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('SSE: Received ListTools request');
      return { tools: ALL_TOOLS };
    });

    // Register tool execution handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info(`SSE: Received CallTool request for: ${name}`);

      try {
        const handler = TOOL_HANDLERS[name as keyof typeof TOOL_HANDLERS] as any;

        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        let result;

        // Route to appropriate handler
        switch (name) {
          case 'execute_task_spec':
            result = await handler(args as any);
            break;

          case 'run_critic_review':
            result = await handler(args?.session_id || '', {
              artifact_id: args?.artifact_id || '',
              review_depth: args?.review_depth || 'standard'
            });
            break;

          case 'revise_code':
            result = await handler({
              artifact_id: args?.artifact_id,
              feedback: args?.feedback
            });
            break;

          case 'get_repo_map':
            result = await handler({
              repo_path: args?.repo_path,
              include_tests: args?.include_tests ?? true
            });
            break;

          case 'get_project_status':
            result = await handler({
              session_id: args?.session_id
            });
            break;

          case 'read_org_policies':
            result = await handler({
              policy_type: args?.policy_type
            });
            break;

          case 'configure_endpoint':
            result = await handler({
              agent_type: args?.agent_type,
              provider_config: args?.provider_config
            });
            break;

          case 'set_system_prompts':
            result = await handler({
              agent_type: args?.agent_type,
              new_prompts: args?.prompts
            });
            break;

          case 'get_progress_summary':
            result = await handler({
              session_id: args?.session_id
            });
            break;

          case 'final_handoff_archive':
            result = await handler({
              session_id: args?.session_id
            });
            break;

          case 'generate_test_suite':
            result = await handler({
              artifact_id: args?.artifact_id,
              framework: args?.test_framework,
              coverage_target: args?.coverage_target || 80
            });
            break;

          case 'inject_alternative_pattern':
            result = await handler({
              pattern: args?.pattern,
              context: args?.context
            });
            break;

          case 'health_check':
            result = await handler();
            break;

          default:
            throw new Error(`Tool ${name} handler not implemented`);
        }

        logger.info(`SSE: Successfully executed tool: ${name}`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error: any) {
        logger.error(`SSE: Error executing tool ${name}: ${error.message}`);

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
      }
    });

    // Create SSE transport
    const transport = new SSEServerTransport('/messages', res);

    // Connect server to transport
    await server.connect(transport);

    logger.info('SSE: Server connected to transport');

    // Handle connection close
    req.on('close', () => {
      logger.info('SSE connection closed');
      server.close();
    });
  });

  // POST endpoint for sending messages
  app.post('/messages', async (req, res) => {
    logger.debug('Received message on /messages endpoint');
    // This endpoint is used by the SSE transport
    // Messages are handled through the transport layer
    res.sendStatus(200);
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      available_endpoints: ['/health', '/sse', '/messages']
    });
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`Express error: ${err.message}`);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  // Start HTTP server
  const httpServer = app.listen(port, () => {
    logger.info(`ALCS MCP Server (SSE) listening on http://localhost:${port}`);
    logger.info(`SSE endpoint: http://localhost:${port}/sse`);
    logger.info(`Health check: http://localhost:${port}/health`);
    logger.info(`Registered ${ALL_TOOLS.length} MCP tools`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down SSE server...');
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return httpServer;
}

// Run the server if this file is executed directly
// Note: import.meta is not available in CommonJS output, so this check is commented out
// To run this server, import and call startSSEServer() from another file
// or uncomment the lines below to run it directly
/*
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
  startSSEServer(port).catch((error) => {
    logger.error(`Fatal error starting SSE server: ${error.message}`);
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
*/
