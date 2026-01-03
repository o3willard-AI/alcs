# Dual-Agent Local Coding Service - Next Phase Roadmap

This document outlines the tasks required to eliminate the remaining "mock code" and placeholder implementations within the Dual-Agent Local Coding Service. This will enhance the system's robustness, persistence, and analytical capabilities, moving towards a production-ready state.

---

## Phase 1: Persistent Session Storage

**Goal:** Replace the in-memory `sessionStore` with a robust, persistent database solution. This plan recommends **PostgreSQL** due to its widespread adoption, reliability, and strong TypeScript ecosystem.

### Tasks:

1.  **Database Setup & Connection:**
    *   **Task:** Choose a PostgreSQL client/ORM (e.g., Prisma, TypeORM, or a simple `pg` client).
    *   **Task:** Install chosen client/ORM dependencies (e.g., `npm install prisma @prisma/client` or `npm install pg typeorm`).
    *   **Task:** Configure database connection details (host, port, user, password, database name) in `config.json`.
    *   **Task:** Implement database connection and disconnection logic (e.g., in a new `src/services/databaseService.ts`). Ensure connection pooling is handled for efficiency.
    *   **Task:** Define a `Session` entity/model (mirroring the `SessionState` interface) using the chosen ORM/client. This includes mapping complex types like `Set<string>` (for `content_hashes`) to database-compatible formats (e.g., `TEXT[]` or `JSONB`).
    *   **Unit Test:** Write unit tests for `databaseService.ts` to verify database connection, disconnection, and model definition (mocking database interactions).

2.  **Refactor `sessionManager.ts`:**
    *   **Task:** Modify the `sessionManager.ts` functions (`createSessionState`, `getSessionState`, `updateSessionState`, `deleteSessionState`) to interact with the new `databaseService` instead of the in-memory `Map`.
    *   **Task:** Adapt `SessionState` interface usage if necessary due to database-specific type mappings (e.g., handling `Set<string>` conversion).
    *   **Unit Test:** Update unit tests for `sessionManager.ts` to mock the `databaseService` and verify correct database interactions.

3.  **Database Migrations & Seeding (Optional but Recommended):**
    *   **Task:** Implement database migration scripts (if using an ORM that supports them) to manage schema evolution.
    *   **Task:** Implement a basic seeding script for initial data, if required for development or testing.

---

## Phase 2: Actual Execution and Analysis of Generated Code/Tests

**Goal:** Replace mock `testCoverage` and `policyViolations` with actual dynamic analysis from external tools.

### Tasks:

1.  **Define New Interfaces/Types:**
    *   **Task:** (If not already present) Ensure the `Artifact` interface includes a `language` property to facilitate language-specific tool integration.
    *   **Task:** Define interfaces for detailed test execution results and static analysis reports in `src/types/mcp.ts` (leveraging existing `Defect` and `PolicyRule` types where possible, but adding specific tool outputs).

2.  **Test Execution Service (`src/services/testRunnerService.ts`):**
    *   **Task:** Implement a `TestRunnerService` class/module.
    *   **Task:** The service should accept a code `Artifact`, a test code `Artifact`, and a `TestFramework`.
    *   **Task:** It will write both code and test code to temporary files in a secure, isolated environment.
    *   **Task:** Implement logic to execute the appropriate test runner command (e.g., `jest`, `pytest`) as a child process.
    *   **Task:** Parse the output from the test runner to extract `test_count`, `estimated_coverage` (e.g., from coverage reports), and convert test failures into `Defect` objects.
    *   **Task (Security Critical):** Implement sandboxing for test execution (e.g., using Docker containers or strictly controlled execution environments) to prevent malicious generated code from impacting the host system.
    *   **Unit Test:** Write unit tests for `TestRunnerService` (mocking file system operations and child process execution).

3.  **Static Analysis Service (`src/services/staticAnalysisService.ts`):**
    *   **Task:** Implement a `StaticAnalysisService` class/module.
    *   **Task:** The service should accept a code `Artifact` and a list of `PolicyRule`s.
    *   **Task:** It will write the code to a temporary file.
    *   **Task:** Implement logic to execute appropriate static analysis tools (e.g., ESLint for JavaScript, Bandit for Python security, Flake8 for Python style) as child processes.
    *   **Task:** Parse the output from the static analysis tools, identify `policyViolations` (matching against `PolicyRule` patterns), and convert them into `Defect` objects.
    *   **Unit Test:** Write unit tests for `StaticAnalysisService` (mocking file system operations and child process execution).

4.  **Integrate Services into `runCriticReview.ts`:**
    *   **Task:** Modify the `run_critic_review` tool to:
        *   Instantiate `TestRunnerService` and `StaticAnalysisService`.
        *   Call `TestRunnerService` to execute tests on the Alpha-generated code (if a test artifact is available).
        *   Call `StaticAnalysisService` to analyze the code artifact against policies.
        *   Collect the real `testCoverage` and `policyViolations` from these services.
        *   Pass these real values (along with `defects` from Agent Beta's review) to `calculateQualityScore` instead of using mock values.
    *   **Unit Test:** Update unit tests for `run_critic_review` to mock `TestRunnerService` and `StaticAnalysisService` appropriately.

---

## Phase 3: Dynamic Generation of Recommendations

**Goal:** Implement logic to generate meaningful recommendations based on the comprehensive session data.

### Tasks:

1.  **Recommendation Generation Logic (`src/services/recommendationService.ts`):**
    *   **Task:** Create a new service `RecommendationService` (or integrate this logic into `final_handoff_archive`).
    *   **Task:** The service should accept a full `SessionState` object.
    *   **Task:** Implement logic to analyze the `SessionState` data, including `score_history`, detailed `defects` and `suggestions` from past reviews, `required_changes`, and the `convergence_trend`.
    *   **Task:** Generate a textual summary of key findings and actionable recommendations for the orchestrator or developer. This could involve:
        *   Summarizing recurring defects.
        *   Highlighting areas of significant improvement or regression.
        *   Suggesting alternative approaches if the loop stagnated or escalated.
        *   (Optional, advanced) Making another LLM call to a specialized "recommender" model, feeding it the session history to generate nuanced recommendations.
    *   **Unit Test:** Write unit tests for `RecommendationService` (mocking `SessionState` and LLM calls if applicable).

2.  **Integrate into `final_handoff_archive.ts`:**
    *   **Task:** Modify `final_handoff_archive` to call the `RecommendationService` (or execute the integrated logic).
    *   **Task:** Populate the `recommendations` field in `FinalHandoffArchiveResponse` with the dynamically generated content.
    *   **Unit Test:** Update unit tests for `final_handoff_archive` to verify that recommendations are correctly generated and included.

---

## Cross-Cutting Concerns for the Next Phase:

*   **Robust Error Handling:** Ensure all new service integrations (database, external tools) include comprehensive error handling and logging.
*   **Performance Optimization:** Profile and optimize performance for database interactions, file I/O, and child process executions.
*   **Security hardening:** Especially for child process execution (test runners, static analyzers), ensure strict sandboxing and input validation to prevent arbitrary code execution or data leaks.
*   **Configuration:** Add new configuration options to `config.json` for database connection strings, paths to external tools, and recommendation generation parameters.
*   **Documentation:** Update `README.md` and other relevant documentation to reflect new features, configuration options, and operational aspects.
*   **Unit Test Fixes:** Resolve the existing unit test failures due to mocking complexities, ensuring a fully green test suite after these new implementations.

This roadmap provides a structured approach to evolving the Dual-Agent Local Coding Service from its current functional state to a more robust and intelligent system by replacing its remaining placeholder components.
