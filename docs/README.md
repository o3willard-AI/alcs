# ALCS Documentation

Welcome to the Dual-Agent Local Coding Service (ALCS) documentation.

## Getting Started

- **[Quick Setup Guide](./QUICK-SETUP.md)** - Get up and running in 5 minutes
- **[Installation Guide](./INSTALLATION.md)** - Complete installation instructions
- **[Architecture Overview](./ARCHITECTURE.md)** - System design and components

## Core Documentation

### System Architecture

- **[Architecture](./ARCHITECTURE.md)** - High-level system design
- **[State Machine](./STATE-MACHINE.md)** - Workflow orchestration
- **[Test Runner Architecture](./TEST-RUNNER-ARCHITECTURE.md)** - Real test execution system
- **[MCP Protocol](./MCP-PROTOCOL.md)** - Model Context Protocol integration

### Agent System

- **[Agent Alpha (Coder)](./AGENT-ALPHA.md)** - Implementation agent
- **[Agent Beta (Critic)](./AGENT-BETA.md)** - Review agent
- **[Agent Configuration](./AGENT-CONFIGURATION.md)** - Setting up LLM providers
- **[Prompt Engineering](./PROMPTS.md)** - System prompts and templates

### Features

- **[Test Execution](./TEST-RUNNER-ARCHITECTURE.md)** - Running tests for Python, JS, Go, Java
- **[Static Analysis](./STATIC-ANALYSIS.md)** - Code quality and security checks
- **[Quality Scoring](./QUALITY-SCORING.md)** - How code quality is measured
- **[Policy Enforcement](./POLICIES.md)** - Organizational coding standards

## Installation & Setup

- **[Installation Guide](./INSTALLATION.md)** - Complete setup instructions
- **[Quick Setup](./QUICK-SETUP.md)** - Fast-track installation
- **[Docker Setup](./INSTALLATION.md#method-2-docker-images)** - Containerized deployment
- **[Configuration](./CONFIGURATION.md)** - System configuration options

## Usage Guides

- **[MCP Tools Reference](./MCP-TOOLS.md)** - Available MCP tools and parameters
- **[Task Specification](./TASK-SPEC.md)** - Writing task specifications
- **[Code Review Process](./REVIEW-PROCESS.md)** - Understanding the review cycle
- **[Examples](../examples/README.md)** - Sample task specifications

## Development

- **[Development Guide](./DEVELOPMENT.md)** - Contributing to ALCS
- **[Testing Guide](./TESTING.md)** - Writing and running tests
- **[API Reference](./API.md)** - Internal API documentation
- **[Database Schema](./DATABASE.md)** - Prisma schema and migrations

## Operations

- **[Deployment](./DEPLOYMENT.md)** - Production deployment guide
- **[Monitoring](./MONITORING.md)** - Logging and observability
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[Performance Tuning](./PERFORMANCE.md)** - Optimization guidelines

## Scripts Reference

ALCS includes several utility scripts:

### Installation Scripts

| Script | Description |
|--------|-------------|
| `scripts/install-analysis-tools.sh` | Install test frameworks and analyzers |
| `scripts/build-test-images.sh` | Build Docker test runner images |
| `scripts/verify-installation.sh` | Verify installation completeness |

### Usage Examples

```bash
# Install all tools
./scripts/install-analysis-tools.sh --all

# Build all Docker images
./scripts/build-test-images.sh --all

# Verify installation
./scripts/verify-installation.sh --full

# Install Python tools only
./scripts/install-analysis-tools.sh --python

# Build specific image
./scripts/build-test-images.sh --python --no-cache

# Quick verification
./scripts/verify-installation.sh --quick
```

See [INSTALLATION.md](./INSTALLATION.md) for detailed script documentation.

## Project Structure

```
alcs/
├── docs/                    # Documentation
│   ├── README.md           # This file
│   ├── INSTALLATION.md     # Setup guide
│   ├── ARCHITECTURE.md     # System design
│   └── ...
├── src/                     # Source code
│   ├── agents/             # Agent implementations
│   ├── services/           # Core services
│   ├── tools/              # MCP tool handlers
│   ├── types/              # TypeScript types
│   └── mcp-server.ts       # MCP server entry point
├── tests/                   # Test suites
├── scripts/                 # Utility scripts
├── docker/                  # Docker configurations
├── config/                  # Configuration files
├── prisma/                  # Database schema and migrations
└── examples/               # Example task specifications
```

## Key Concepts

### Dual-Agent Architecture

ALCS uses two specialized agents:

1. **Agent Alpha (Coder)** - Generates code implementations
2. **Agent Beta (Critic)** - Reviews code and provides feedback

This separation enables:
- Specialized focus for each agent
- Iterative refinement through feedback loops
- High-quality code generation with fewer hallucinations

### State Machine Workflow

The system follows a defined state machine:

```
IDLE → CODING → REVIEWING → REVISING → COMPLETED
                     ↓
                 ESCALATED
```

Each state has specific responsibilities and transitions based on quality metrics.

### Real Test Execution

Unlike simulation-based approaches, ALCS:
- Executes real tests in isolated Docker containers
- Measures actual code coverage
- Captures real test failures
- Runs static analysis tools (pylint, ESLint, bandit)

### Quality-Driven Iteration

Code quality is measured through:
- Test coverage percentage
- Number and severity of defects
- Static analysis violations
- Policy compliance

The system iterates until quality thresholds are met or max iterations reached.

## Supported Languages

| Language | Test Framework | Static Analysis | Coverage |
|----------|---------------|-----------------|----------|
| Python | pytest | pylint, bandit | coverage.py |
| JavaScript/TypeScript | Jest | ESLint | Jest coverage |
| Go | go test | (planned) | go cover |
| Java | JUnit + Maven | (planned) | JaCoCo |

## MCP Integration

ALCS exposes its functionality via the Model Context Protocol (MCP), enabling integration with:

- Claude Desktop
- Claude Code
- Other MCP-compatible AI assistants
- Custom integrations

Key MCP tools:
- `execute_task_spec` - Execute a coding task
- `run_critic_review` - Trigger code review
- `revise_code` - Apply review feedback
- `get_project_status` - Check session status
- `generate_test_suite` - Create tests for code

See [MCP-TOOLS.md](./MCP-TOOLS.md) for complete tool reference.

## Configuration

ALCS can be configured via:

1. **Environment variables** (`.env` file)
2. **Configuration files** (`config/default.json`)
3. **Runtime parameters** (MCP tool arguments)

Key configuration areas:
- Database connection
- LLM provider settings (Anthropic, OpenAI, etc.)
- Quality thresholds
- Iteration limits
- Test execution timeouts
- Resource limits

See [CONFIGURATION.md](./CONFIGURATION.md) for details.

## Security Considerations

ALCS implements multiple security layers:

1. **Docker Isolation** - All code execution in containers
2. **Capability Dropping** - Minimal container privileges
3. **Network Isolation** - No network access during execution
4. **Resource Limits** - CPU, memory, and PID limits
5. **Static Analysis** - Security vulnerability detection (bandit)

See [SECURITY.md](./SECURITY.md) for comprehensive security documentation.

## Performance

Typical performance characteristics:

| Metric | Value |
|--------|-------|
| Simple task (Hello World) | 30-60 seconds |
| Medium task (CRUD API) | 2-5 minutes |
| Complex task (Full feature) | 5-15 minutes |
| Test execution (Python) | 5-30 seconds |
| Static analysis | 2-10 seconds |

Performance depends on:
- Task complexity
- Number of iterations required
- LLM response time
- Test suite size

## Roadmap

See [GA-ROADMAP.md](./GA-ROADMAP.md) for the complete development roadmap.

### Current Status (Phase 3 Complete)

- ✅ Phase 0: Stabilization
- ✅ Phase 1: MCP Server Integration
- ✅ Phase 2: Persistent Storage
- ✅ Phase 3: Real Test Execution & Static Analysis

### Upcoming Phases

- 🔄 Phase 4: Dynamic Recommendations
- 📋 Phase 5: Advanced MCP Tools
- 📋 Phase 6: GA Readiness

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Areas we'd love help with:
- Additional language support (Rust, C++, Ruby, etc.)
- More static analyzers
- Performance optimizations
- Documentation improvements
- Example task specifications

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-org/alcs/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/your-org/alcs/discussions)
- **Documentation**: You're reading it!

## License

ALCS is released under the [MIT License](../LICENSE).

---

**Quick Links:**
- [Installation Guide](./INSTALLATION.md)
- [Quick Setup](./QUICK-SETUP.md)
- [Architecture](./ARCHITECTURE.md)
- [MCP Tools](./MCP-TOOLS.md)
- [Examples](../examples/README.md)
