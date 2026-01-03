# ALCS MCP Tools Reference

This document provides a reference for all 12 MCP tools exposed by the ALCS server.

## Overview

The Dual-Agent Local Coding Service exposes its functionality through 12 standardized MCP tools that can be called by AI orchestrators like Claude Code, MS Copilot, or Gemini CLI.

---

## Tools

### 1. execute_task_spec

**Purpose:** Initiates a new coding task

**Description:** Creates a new session and directs Agent Alpha to generate initial code based on the provided specification.

**Parameters:**
- `spec` (required): Task specification object
  - `task_description` (string, required): What code should be generated
  - `language` (string, required): Programming language (python, javascript, typescript, go, rust, etc.)
  - `framework` (string, optional): Framework to use (react, fastapi, express, etc.)
  - `context` (string, optional): Additional context or constraints
  - `test_framework` (string, optional): Preferred test framework (pytest, jest, junit, etc.)
- `quality_threshold` (number, optional): Minimum quality score 0-100 (defaults to config value)
- `max_iterations` (number, optional): Maximum review-revise iterations (defaults to config value)

**Returns:**
- `session_id`: Unique session identifier
- `artifact`: Generated code artifact
- `state`: Current session state

**Example:**
```json
{
  "spec": {
    "task_description": "Create a REST API endpoint for user authentication",
    "language": "python",
    "framework": "fastapi",
    "test_framework": "pytest"
  },
  "quality_threshold": 90,
  "max_iterations": 5
}
```

---

### 2. run_critic_review

**Purpose:** Triggers code review by Agent Beta

**Description:** Performs comprehensive code review, calculates quality score, and provides detailed feedback.

**Parameters:**
- `session_id` (string, required): The session to review
- `artifact_id` (string, required): The artifact to review
- `review_depth` (string, optional): Depth of review - "quick", "standard", or "comprehensive" (default: "standard")

**Returns:**
- `review_id`: Unique review identifier
- `quality_score`: Calculated quality score (0-100)
- `defects`: List of identified defects
- `suggestions`: Improvement suggestions
- `recommendation`: "approve", "revise", or "escalate"

---

### 3. revise_code

**Purpose:** Directs Agent Alpha to revise code based on feedback

**Description:** Takes review feedback and directs Agent Alpha to incorporate improvements and address defects.

**Parameters:**
- `session_id` (string, required): The session containing code to revise
- `feedback` (object, required): Review feedback from Agent Beta
  - `defects`: List of defects to fix
  - `suggestions`: Improvement suggestions
  - `required_changes`: Required changes

**Returns:**
- `artifact`: Revised code artifact
- `changes_summary`: Summary of changes made

---

### 4. get_repo_map

**Purpose:** Returns repository structure

**Description:** Provides a hierarchical view of the repository with file listings and token estimates.

**Parameters:**
- `repo_path` (string, required): Path to repository root
- `include_tests` (boolean, optional): Include test files (default: true)

**Returns:**
- `structure`: Hierarchical file structure
- `token_estimates`: Token count estimates for files

---

### 5. get_project_status

**Purpose:** Returns current session status

**Description:** Gets the current state, iteration count, quality scores, and artifacts for a session.

**Parameters:**
- `session_id` (string, required): The session to check

**Returns:**
- `state`: Current state machine state
- `current_iteration`: Current iteration number
- `score_history`: Quality score progression
- `artifacts`: List of all artifacts

---

### 6. read_org_policies

**Purpose:** Loads organizational coding policies

**Description:** Retrieves coding policies (security, style, or custom) for validation.

**Parameters:**
- `policy_type` (string, required): Type of policies - "security", "style", or "custom"

**Returns:**
- `policy_type`: Type of policies loaded
- `rules`: List of policy rules
- `source`: "file" or "default"

---

### 7. configure_endpoint

**Purpose:** Updates LLM endpoint configuration

**Description:** Dynamically changes the LLM provider, model, or API key for an agent at runtime.

**Parameters:**
- `agent_type` (string, required): "alpha" or "beta"
- `provider_config` (object, required): New provider configuration
  - `type` (string, required): "ollama", "lmstudio", or "openrouter"
  - `base_url` (string, required): Provider API base URL
  - `model` (string, required): Model identifier
  - `api_key` (string, optional): API key for cloud providers

**Returns:**
- `previous_config`: Previous configuration
- `health_check`: Connection test result

---

### 8. set_system_prompts

**Purpose:** Updates agent system prompts

**Description:** Customizes the system prompts used by Agent Alpha or Beta.

**Parameters:**
- `agent_type` (string, required): "alpha" or "beta"
- `prompts` (object, required): New prompts
  - `base_prompt` (string, required): Base system prompt
  - `role_context` (string, optional): Additional role context

**Returns:**
- `previous_prompts`: Previous prompt configuration
- `updated`: Confirmation

---

### 9. get_progress_summary

**Purpose:** Returns progress summary

**Description:** Provides a summary of progress through the review-revise loop.

**Parameters:**
- `session_id` (string, required): The session to summarize

**Returns:**
- `iteration_count`: Number of iterations completed
- `score_trend`: Quality score progression
- `convergence_status`: Improvement trend analysis

---

### 10. final_handoff_archive

**Purpose:** Finalizes session and returns archive

**Description:** Completes the session and returns comprehensive archive with all artifacts and audit trail.

**Parameters:**
- `session_id` (string, required): The session to finalize

**Returns:**
- `final_artifact`: Final approved code
- `all_artifacts`: Complete artifact history
- `audit_trail`: Full development history
- `recommendations`: Post-development recommendations

---

### 11. generate_test_suite

**Purpose:** Generates comprehensive tests

**Description:** Directs Agent Beta to create a test suite for the generated code.

**Parameters:**
- `session_id` (string, required): The session containing code
- `artifact_id` (string, required): The artifact to test
- `test_framework` (string, required): Framework - "pytest", "jest", "junit", "go_test", "rspec", "mocha", "unittest", or "vitest"
- `coverage_target` (number, optional): Target coverage % (default: 80)

**Returns:**
- `test_artifact`: Generated test suite
- `estimated_coverage`: Estimated code coverage

---

### 12. inject_alternative_pattern

**Purpose:** Suggests alternative code patterns

**Description:** Injects an alternative approach for Agent Alpha to consider during generation or revision.

**Parameters:**
- `session_id` (string, required): The session to inject into
- `pattern` (object, required): The alternative pattern
  - `name` (string, required): Pattern name
  - `description` (string, required): Pattern description
  - `example_code` (string, optional): Example code
  - `rationale` (string, optional): Why to use this pattern

**Returns:**
- `injected`: Confirmation
- `pattern_id`: Pattern identifier

---

## Usage Flow

### Typical Workflow:

1. **Start Task**: `execute_task_spec` → Creates session, generates initial code
2. **Review Loop**:
   - `run_critic_review` → Agent Beta reviews code
   - If score < threshold: `revise_code` → Agent Alpha improves code
   - Repeat until approved or max iterations
3. **Optional Enhancements**:
   - `generate_test_suite` → Add comprehensive tests
   - `inject_alternative_pattern` → Suggest different approach
   - `configure_endpoint` → Switch to different model
4. **Complete**: `final_handoff_archive` → Get final deliverable

### Monitoring:
- `get_project_status` → Check current state anytime
- `get_progress_summary` → View iteration progress
- `read_org_policies` → Verify policy compliance

---

## Error Handling

All tools return errors in a standardized format:

```json
{
  "error": "Error message",
  "tool": "tool_name"
}
```

Common errors:
- Session not found
- Artifact not found
- Invalid parameters
- LLM endpoint unavailable
- Quality threshold not met

---

## Best Practices

1. **Always check status** before calling tools on a session
2. **Monitor progress** during long review loops
3. **Set realistic thresholds** based on task complexity
4. **Use appropriate review depth** (quick for simple changes, comprehensive for complex code)
5. **Configure endpoints** once at session start
6. **Archive sessions** when complete to free resources

---

**Version:** 1.0.0
**Last Updated:** 2026-01-01
