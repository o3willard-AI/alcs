/**
 * MCP Tools Registry
 *
 * This file defines all MCP tool schemas and handlers for the ALCS server.
 * Each tool is exposed via the Model Context Protocol for use by AI orchestrators.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Import tool implementations
import { execute_task_spec } from '../tools/executeTaskSpec.js';
import { run_critic_review } from '../tools/runCriticReview.js';
import { revise_code } from '../tools/reviseCode.js';
import { get_repo_map } from '../tools/getRepoMap.js';
import { get_project_status } from '../tools/getProjectStatus.js';
import { read_org_policies } from '../tools/readOrgPolicies.js';
import { configure_endpoint } from '../tools/configureEndpoint.js';
import { set_system_prompts } from '../tools/setSystemPrompts.js';
import { get_progress_summary } from '../tools/getProgressSummary.js';
import { final_handoff_archive } from '../tools/finalHandoffArchive.js';
import { generate_test_suite } from '../tools/generateTestSuite.js';
import { inject_alternative_pattern } from '../tools/injectAlternativePattern.js';
import { health_check } from '../tools/healthCheck.js';

/**
 * Tool 1: execute_task_spec
 * Initiates a new coding task by creating a session and generating initial code via Agent Alpha.
 */
export const executeTaskSpecTool: Tool = {
  name: 'execute_task_spec',
  description: 'Initiates a new coding task by creating a session and having Agent Alpha generate initial code based on the provided specification. This is the entry point for delegating coding tasks to the local agents.',
  inputSchema: {
    type: 'object',
    properties: {
      spec: {
        type: 'object',
        description: 'The task specification containing requirements for code generation',
        properties: {
          task_description: {
            type: 'string',
            description: 'Detailed description of what code should be generated'
          },
          language: {
            type: 'string',
            description: 'Programming language (e.g., python, javascript, typescript, go, rust)'
          },
          framework: {
            type: 'string',
            description: 'Framework to use (optional, e.g., react, fastapi, express)'
          },
          context: {
            type: 'string',
            description: 'Additional context or constraints for code generation'
          },
          test_framework: {
            type: 'string',
            description: 'Preferred test framework (optional, e.g., pytest, jest, junit)'
          }
        },
        required: ['task_description', 'language']
      },
      quality_threshold: {
        type: 'number',
        description: 'Minimum quality score (0-100) required for approval (optional, defaults to config value)',
        minimum: 0,
        maximum: 100
      },
      max_iterations: {
        type: 'number',
        description: 'Maximum number of review-revise iterations (optional, defaults to config value)',
        minimum: 1,
        maximum: 20
      }
    },
    required: ['spec']
  }
};

/**
 * Tool 2: run_critic_review
 * Triggers Agent Beta to perform a comprehensive code review on a generated artifact.
 */
export const runCriticReviewTool: Tool = {
  name: 'run_critic_review',
  description: 'Triggers Agent Beta to perform a comprehensive code review on a generated artifact, calculating a quality score and providing detailed feedback for improvement.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID to review'
      },
      artifact_id: {
        type: 'string',
        description: 'The artifact ID to review'
      },
      review_depth: {
        type: 'string',
        enum: ['quick', 'standard', 'comprehensive'],
        description: 'Depth of review to perform',
        default: 'standard'
      }
    },
    required: ['session_id', 'artifact_id']
  }
};

/**
 * Tool 3: revise_code
 * Directs Agent Alpha to revise code based on review feedback.
 */
export const reviseCodeTool: Tool = {
  name: 'revise_code',
  description: 'Directs Agent Alpha to revise code based on review feedback from Agent Beta, incorporating suggested improvements and addressing defects.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID containing the code to revise'
      },
      feedback: {
        type: 'object',
        description: 'Review feedback from Agent Beta',
        properties: {
          defects: {
            type: 'array',
            description: 'List of identified defects'
          },
          suggestions: {
            type: 'array',
            description: 'List of improvement suggestions'
          },
          required_changes: {
            type: 'array',
            description: 'List of required changes'
          }
        }
      }
    },
    required: ['session_id', 'feedback']
  }
};

/**
 * Tool 4: get_repo_map
 * Returns a hierarchical view of the repository structure.
 */
export const getRepoMapTool: Tool = {
  name: 'get_repo_map',
  description: 'Returns a hierarchical view of the repository structure with file listings and token estimates, useful for understanding project organization.',
  inputSchema: {
    type: 'object',
    properties: {
      repo_path: {
        type: 'string',
        description: 'Path to the repository root'
      },
      include_tests: {
        type: 'boolean',
        description: 'Whether to include test files',
        default: true
      }
    },
    required: ['repo_path']
  }
};

/**
 * Tool 5: get_project_status
 * Returns the current status of a coding session.
 */
export const getProjectStatusTool: Tool = {
  name: 'get_project_status',
  description: 'Returns the current status of a coding session including state, iteration count, quality scores, and current artifacts.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID to check status for'
      }
    },
    required: ['session_id']
  }
};

/**
 * Tool 6: read_org_policies
 * Loads organizational coding policies for validation.
 */
export const readOrgPoliciesTool: Tool = {
  name: 'read_org_policies',
  description: 'Loads organizational coding policies (security, style, or custom) that will be used to validate generated code.',
  inputSchema: {
    type: 'object',
    properties: {
      policy_type: {
        type: 'string',
        enum: ['security', 'style', 'custom'],
        description: 'Type of policies to load'
      }
    },
    required: ['policy_type']
  }
};

/**
 * Tool 7: configure_endpoint
 * Dynamically updates the LLM endpoint configuration for an agent.
 */
export const configureEndpointTool: Tool = {
  name: 'configure_endpoint',
  description: 'Dynamically updates the LLM endpoint configuration (model, provider, API key) for Agent Alpha or Agent Beta at runtime.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_type: {
        type: 'string',
        enum: ['alpha', 'beta'],
        description: 'Which agent to configure'
      },
      provider_config: {
        type: 'object',
        description: 'New provider configuration',
        properties: {
          type: {
            type: 'string',
            enum: ['ollama', 'lmstudio', 'openrouter'],
            description: 'LLM provider type'
          },
          base_url: {
            type: 'string',
            description: 'Base URL for the provider API'
          },
          model: {
            type: 'string',
            description: 'Model identifier'
          },
          api_key: {
            type: 'string',
            description: 'API key (optional, for cloud providers)'
          }
        },
        required: ['type', 'base_url', 'model']
      }
    },
    required: ['agent_type', 'provider_config']
  }
};

/**
 * Tool 8: set_system_prompts
 * Updates the system prompts for an agent.
 */
export const setSystemPromptsTool: Tool = {
  name: 'set_system_prompts',
  description: 'Updates the system prompts used by Agent Alpha or Agent Beta to customize their behavior and expertise.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_type: {
        type: 'string',
        enum: ['alpha', 'beta'],
        description: 'Which agent to configure'
      },
      prompts: {
        type: 'object',
        description: 'New system prompts',
        properties: {
          base_prompt: {
            type: 'string',
            description: 'Base system prompt'
          },
          role_context: {
            type: 'string',
            description: 'Additional role context (optional)'
          }
        },
        required: ['base_prompt']
      }
    },
    required: ['agent_type', 'prompts']
  }
};

/**
 * Tool 9: get_progress_summary
 * Returns a summary of progress through the review-revise loop.
 */
export const getProgressSummaryTool: Tool = {
  name: 'get_progress_summary',
  description: 'Returns a summary of progress through the review-revise loop including iteration count, quality score trends, and convergence status.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID to summarize'
      }
    },
    required: ['session_id']
  }
};

/**
 * Tool 10: final_handoff_archive
 * Completes the session and returns a comprehensive archive.
 */
export const finalHandoffArchiveTool: Tool = {
  name: 'final_handoff_archive',
  description: 'Completes the coding session and returns a comprehensive archive containing all artifacts, reviews, and an audit trail of the development process.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID to finalize'
      }
    },
    required: ['session_id']
  }
};

/**
 * Tool 11: generate_test_suite
 * Directs Agent Beta to generate comprehensive tests for code.
 */
export const generateTestSuiteTool: Tool = {
  name: 'generate_test_suite',
  description: 'Directs Agent Beta to generate a comprehensive test suite for the generated code using the specified test framework.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID containing the code'
      },
      artifact_id: {
        type: 'string',
        description: 'The artifact ID to generate tests for'
      },
      test_framework: {
        type: 'string',
        enum: ['pytest', 'jest', 'junit', 'go_test', 'rspec', 'mocha', 'unittest', 'vitest'],
        description: 'Test framework to use'
      },
      coverage_target: {
        type: 'number',
        description: 'Target code coverage percentage (optional)',
        minimum: 0,
        maximum: 100,
        default: 80
      }
    },
    required: ['session_id', 'artifact_id', 'test_framework']
  }
};

/**
 * Tool 12: inject_alternative_pattern
 * Injects an alternative code pattern or approach for Agent Alpha to consider.
 */
export const injectAlternativePatternTool: Tool = {
  name: 'inject_alternative_pattern',
  description: 'Injects an alternative code pattern, design approach, or implementation strategy for Agent Alpha to consider during code generation or revision.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID to inject the pattern into'
      },
      pattern: {
        type: 'object',
        description: 'The alternative pattern to inject',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the pattern'
          },
          description: {
            type: 'string',
            description: 'Description of the pattern'
          },
          example_code: {
            type: 'string',
            description: 'Example code demonstrating the pattern'
          },
          rationale: {
            type: 'string',
            description: 'Why this pattern should be considered'
          }
        },
        required: ['name', 'description']
      }
    },
    required: ['session_id', 'pattern']
  }
};

/**
 * Tool 13: health_check
 * Returns server health status including endpoint connectivity
 */
export const healthCheckTool: Tool = {
  name: 'health_check',
  description: 'Returns server health status including LLM endpoint connectivity, latency, and uptime.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};

/**
 * All tools exported as an array for registration
 */
export const ALL_TOOLS: Tool[] = [
  executeTaskSpecTool,
  runCriticReviewTool,
  reviseCodeTool,
  getRepoMapTool,
  getProjectStatusTool,
  readOrgPoliciesTool,
  configureEndpointTool,
  setSystemPromptsTool,
  getProgressSummaryTool,
  finalHandoffArchiveTool,
  generateTestSuiteTool,
  injectAlternativePatternTool,
  healthCheckTool,
];

/**
 * Tool handlers map
 * Maps tool names to their implementation functions
 */
export const TOOL_HANDLERS = {
  execute_task_spec,
  run_critic_review,
  revise_code,
  get_repo_map,
  get_project_status,
  read_org_policies,
  configure_endpoint,
  set_system_prompts,
  get_progress_summary,
  final_handoff_archive,
  generate_test_suite,
  inject_alternative_pattern,
  health_check,
};
