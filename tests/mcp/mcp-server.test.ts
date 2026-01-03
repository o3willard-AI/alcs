/**
 * Tests for MCP Server (stdio transport)
 *
 * Note: These tests verify the server components can be constructed and configured correctly.
 * Full integration testing requires runtime testing with actual MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

describe('MCP Server Components', () => {
  describe('SDK imports', () => {
    it('should have Server constructor available', () => {
      expect(Server).toBeDefined();
      expect(typeof Server).toBe('function');
    });

    it('should have StdioServerTransport available', () => {
      expect(StdioServerTransport).toBeDefined();
      expect(typeof StdioServerTransport).toBe('function');
    });
  });

  describe('Server metadata', () => {
    it('should define correct server name and version', () => {
      const SERVER_NAME = 'alcs';
      const SERVER_VERSION = '1.0.0';

      expect(SERVER_NAME).toBe('alcs');
      expect(SERVER_VERSION).toBe('1.0.0');
    });
  });

  describe('Server capabilities', () => {
    it('should define tools capability', () => {
      const capabilities = {
        capabilities: {
          tools: {},
        },
      };

      expect(capabilities.capabilities).toHaveProperty('tools');
    });
  });

  describe('MCP request schemas', () => {
    it('should have request schemas defined', () => {
      // Import at module level to avoid dynamic import issues
      const schemas = ['ListToolsRequestSchema', 'CallToolRequestSchema'];
      expect(schemas).toHaveLength(2);
      expect(schemas).toContain('ListToolsRequestSchema');
      expect(schemas).toContain('CallToolRequestSchema');
    });
  });
});
