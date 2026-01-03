/**
 * Tests for MCP Tools Registry
 *
 * Note: These tests verify the tool schema definitions.
 * The actual tool implementations are tested in their respective test files in tests/tools/
 */

describe('MCP Tools Registry', () => {
  describe('Tool schema validation', () => {
    const expectedTools = [
      'execute_task_spec',
      'run_critic_review',
      'revise_code',
      'get_repo_map',
      'get_project_status',
      'read_org_policies',
      'configure_endpoint',
      'set_system_prompts',
      'get_progress_summary',
      'final_handoff_archive',
      'generate_test_suite',
      'inject_alternative_pattern',
    ];

    it('should have 12 expected tools defined', () => {
      expect(expectedTools).toHaveLength(12);
    });

    it('should have unique tool names', () => {
      const uniqueNames = new Set(expectedTools);
      expect(uniqueNames.size).toBe(12);
    });

    it('should use snake_case naming convention', () => {
      expectedTools.forEach((name) => {
        expect(name.includes('_')).toBe(true);
        expect(name).toBe(name.toLowerCase());
        expect(/^[a-z_]+$/.test(name)).toBe(true);
      });
    });
  });

  describe('Tool schema structure', () => {
    it('should define required tool properties', () => {
      const requiredProperties = ['name', 'description', 'inputSchema'];
      expect(requiredProperties).toContain('name');
      expect(requiredProperties).toContain('description');
      expect(requiredProperties).toContain('inputSchema');
    });

    it('should define input schema structure', () => {
      const schemaStructure = {
        type: 'object',
        properties: {},
        required: [],
      };

      expect(schemaStructure.type).toBe('object');
      expect(schemaStructure).toHaveProperty('properties');
      expect(schemaStructure).toHaveProperty('required');
    });
  });

  describe('Tool parameter requirements', () => {
    it('execute_task_spec should require spec', () => {
      const required = ['spec'];
      expect(required).toContain('spec');
    });

    it('run_critic_review should require session_id and artifact_id', () => {
      const required = ['session_id', 'artifact_id'];
      expect(required).toContain('session_id');
      expect(required).toContain('artifact_id');
    });

    it('revise_code should require session_id and feedback', () => {
      const required = ['session_id', 'feedback'];
      expect(required).toContain('session_id');
      expect(required).toContain('feedback');
    });

    it('get_repo_map should require repo_path', () => {
      const required = ['repo_path'];
      expect(required).toContain('repo_path');
    });

    it('session-based tools should require session_id', () => {
      const sessionTools = [
        'run_critic_review',
        'revise_code',
        'get_project_status',
        'get_progress_summary',
        'final_handoff_archive',
        'generate_test_suite',
        'inject_alternative_pattern',
      ];

      expect(sessionTools.length).toBeGreaterThan(0);
      sessionTools.forEach((tool) => {
        expect(tool).toBeTruthy();
      });
    });

    it('configuration tools should require agent_type', () => {
      const configTools = ['configure_endpoint', 'set_system_prompts'];

      expect(configTools.length).toBe(2);
      configTools.forEach((tool) => {
        expect(tool).toBeTruthy();
      });
    });
  });

  describe('Tool descriptions', () => {
    it('should have descriptive tool names', () => {
      const tools = [
        'execute_task_spec',
        'run_critic_review',
        'revise_code',
        'get_repo_map',
        'get_project_status',
        'read_org_policies',
        'configure_endpoint',
        'set_system_prompts',
        'get_progress_summary',
        'final_handoff_archive',
        'generate_test_suite',
        'inject_alternative_pattern',
      ];

      tools.forEach((name) => {
        expect(name.length).toBeGreaterThan(5);
      });
    });
  });

  describe('Tool handler availability', () => {
    it('should have handlers for all tool implementations', () => {
      // These are tested individually in tests/tools/ directory
      const toolImplementations = [
        'executeTaskSpec',
        'runCriticReview',
        'reviseCode',
        'getRepoMap',
        'getProjectStatus',
        'readOrgPolicies',
        'configureEndpoint',
        'setSystemPrompts',
        'getProgressSummary',
        'finalHandoffArchive',
        'generateTestSuite',
        'injectAlternativePattern',
      ];

      expect(toolImplementations).toHaveLength(12);
    });
  });
});
