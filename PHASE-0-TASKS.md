# Phase 0: Stabilization - Detailed Task Breakdown

## Overview
Fix all 5 failing unit tests to establish stable baseline before GA work.

**Duration:** 16 hours
**Priority:** CRITICAL - Must complete before other phases

---

## Task 0.1: Fix readOrgPolicies.test.ts

**File:** `tests/tools/readOrgPolicies.test.ts`
**Estimated Time:** 3 hours
**Status:** Not Started

### Problem Analysis:
```
TypeError: Cannot read properties of undefined (reading 'config')
  at read_org_policies (src/tools/readOrgPolicies.ts:21:50)
```

The `configManager.config` is undefined because the singleton isn't properly mocked before the test imports the function.

### Root Cause:
- `configManager` is imported and used at module scope
- Jest mocks must be set up BEFORE importing the module under test
- Current test setup doesn't reset configManager state

### Solution Steps:

1. **Update test file structure:**
```typescript
// At top of test file, before any imports
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      policies_path: './test-policies'
    }
  }
}));

// Then import the function
import { read_org_policies } from '../../src/tools/readOrgPolicies';
```

2. **Alternative: Use jest.doMock with dynamic imports:**
```typescript
describe('read_org_policies', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/services/configService', () => ({
      configManager: {
        config: {
          policies_path: './test-policies'
        }
      }
    }));
  });

  it('should work', async () => {
    const { read_org_policies } = await import('../../src/tools/readOrgPolicies');
    // test code
  });
});
```

3. **Verify all 5 tests pass**

### Testing:
```bash
npm test -- tests/tools/readOrgPolicies.test.ts
```

### Success Criteria:
- All 5 tests pass
- No undefined config errors
- Tests remain isolated

---

## Task 0.2: Fix loggerService.test.ts

**File:** `tests/services/loggerService.test.ts`
**Estimated Time:** 3 hours
**Status:** Not Started

### Problem Analysis:
```
expect(jest.fn()).toHaveBeenCalledTimes(expected)
Expected number of calls: 2
Received number of calls: 0
```

The `DailyRotateFile` transport constructor is not being called even though it's mocked.

### Root Cause:
- Logger is created at module initialization
- Mock is set up after logger creation
- Transport constructors called before mock is in place

### Solution Steps:

1. **Mock winston-daily-rotate-file BEFORE importing logger:**
```typescript
// Create mock constructor
const mockDailyRotateFileConstructor = jest.fn();

jest.mock('winston-daily-rotate-file', () => {
  return mockDailyRotateFileConstructor;
});

// Mock winston module
jest.mock('winston', () => {
  const actualWinston = jest.requireActual('winston');
  return {
    ...actualWinston,
    createLogger: jest.fn(),
    format: actualWinston.format,
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});
```

2. **Reset modules between tests:**
```typescript
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});
```

3. **Import logger after mocks are set:**
```typescript
it('should initialize logger', async () => {
  const { logger } = await import('../../src/services/loggerService');
  // assertions
});
```

### Testing:
```bash
npm test -- tests/services/loggerService.test.ts
```

### Success Criteria:
- All 3 tests pass
- Constructor calls verified
- Transport configuration validated

---

## Task 0.3: Fix concurrencyLimiter.test.ts

**File:** `tests/utils/concurrencyLimiter.test.ts`
**Estimated Time:** 2 hours
**Status:** Not Started

### Problem Analysis:
Timer-based tests are flaky due to real timers mixed with fake timers.

### Root Cause:
- `jest.useFakeTimers()` not properly configured
- Mix of real and fake timers causes race conditions
- Promises not properly flushed

### Solution Steps:

1. **Configure fake timers at test start:**
```typescript
beforeEach(() => {
  jest.useFakeTimers('modern');
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});
```

2. **Properly advance timers in tests:**
```typescript
it('should release after timeout', async () => {
  const limiter = new ConcurrencyLimiter(1);

  const promise = limiter.acquire();

  // Advance timers
  jest.advanceTimersByTime(1000);

  // Wait for promises
  await Promise.resolve();

  // Assertions
  expect(limiter.currentCount).toBe(0);
});
```

3. **Use jest.runAllTimers() for synchronous timer advancement:**
```typescript
jest.runAllTimers();
await flushPromises(); // Helper to flush promise queue
```

4. **Create flushPromises helper:**
```typescript
const flushPromises = () => new Promise(resolve => setImmediate(resolve));
```

### Testing:
```bash
npm test -- tests/utils/concurrencyLimiter.test.ts
```

### Success Criteria:
- All 4 tests pass
- Tests run deterministically
- No race conditions

---

## Task 0.4: Fix retryHandler.test.ts

**File:** `tests/utils/retryHandler.test.ts`
**Estimated Time:** 3 hours
**Status:** Not Started

### Problem Analysis:
Tests for exponential backoff timing are failing due to timing validation issues.

### Root Cause:
- Real `Date.now()` used during test
- Retry intervals not predictable
- Mock timers not synced with Date.now()

### Solution Steps:

1. **Mock Date.now():**
```typescript
let mockDate = 1000000000000;

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.spyOn(Date, 'now').mockImplementation(() => mockDate);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
```

2. **Control time progression:**
```typescript
it('should use exponential backoff', async () => {
  const operation = jest.fn()
    .mockRejectedValueOnce(new Error('fail 1'))
    .mockRejectedValueOnce(new Error('fail 2'))
    .mockResolvedValueOnce('success');

  const retryHandler = new RetryHandler();

  const promise = retryHandler.executeWithRetry(operation, 'test');

  // First attempt fails at time 0
  await flushPromises();
  expect(operation).toHaveBeenCalledTimes(1);

  // Advance to first retry (1 second)
  mockDate += 1000;
  jest.advanceTimersByTime(1000);
  await flushPromises();
  expect(operation).toHaveBeenCalledTimes(2);

  // Advance to second retry (2 seconds)
  mockDate += 2000;
  jest.advanceTimersByTime(2000);
  await flushPromises();
  expect(operation).toHaveBeenCalledTimes(3);

  const result = await promise;
  expect(result).toBe('success');
});
```

3. **Validate retry intervals:**
```typescript
const delays: number[] = [];
const originalSetTimeout = global.setTimeout;

jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
  delays.push(delay);
  return originalSetTimeout(fn, 0);
});

// After test
expect(delays).toEqual([1000, 2000, 4000, 8000]);
```

### Testing:
```bash
npm test -- tests/utils/retryHandler.test.ts
```

### Success Criteria:
- All 5 tests pass
- Retry intervals validated
- Timeout behavior correct

---

## Task 0.5: Fix runCriticReview.test.ts

**File:** `tests/tools/runCriticReview.test.ts`
**Estimated Time:** 3 hours
**Status:** Not Started

### Problem Analysis:
Complex mocking of multiple interdependent services (sessionManager, agentBeta, scoringService).

### Root Cause:
- Multiple services imported at module scope
- Mocks not properly isolated
- Session state changes not reflected

### Solution Steps:

1. **Mock all dependencies before imports:**
```typescript
// Mock session manager
const mockGetSessionState = jest.fn();
const mockUpdateSessionState = jest.fn();

jest.mock('../../src/sessionManager', () => ({
  getSessionState: mockGetSessionState,
  updateSessionState: mockUpdateSessionState
}));

// Mock agent beta
const mockReview = jest.fn();
const mockGenerateTests = jest.fn();

jest.mock('../../src/agents/agentBeta', () => ({
  AgentBeta: jest.fn().mockImplementation(() => ({
    review: mockReview,
    generateTests: mockGenerateTests
  }))
}));

// Mock scoring service
const mockCalculateQualityScore = jest.fn();

jest.mock('../../src/services/scoringService', () => ({
  calculateQualityScore: mockCalculateQualityScore
}));
```

2. **Set up test data before each test:**
```typescript
beforeEach(() => {
  jest.clearAllMocks();

  // Set up mock session state
  const mockSession: SessionState = {
    id: 'test-session',
    state: StateMachineState.REVIEWING,
    current_iteration: 1,
    max_iterations: 5,
    quality_threshold: 85,
    artifacts: [{
      id: 'test-artifact',
      type: 'code',
      content: 'test code',
      description: 'test',
      timestamp: Date.now(),
      metadata: {}
    }],
    score_history: [],
    content_hashes: new Set()
  };

  mockGetSessionState.mockReturnValue(mockSession);

  // Set up agent beta response
  mockReview.mockResolvedValue({
    defects: [],
    suggestions: [],
    required_changes: []
  });

  // Set up scoring
  mockCalculateQualityScore.mockReturnValue(90);
});
```

3. **Import function after mocks:**
```typescript
import { run_critic_review } from '../../src/tools/runCriticReview';
```

4. **Verify interactions:**
```typescript
it('should call agent beta review', async () => {
  const result = await run_critic_review('test-session', {
    artifact_id: 'test-artifact',
    review_depth: 'standard'
  });

  expect(mockReview).toHaveBeenCalledWith('test code');
  expect(mockCalculateQualityScore).toHaveBeenCalled();
  expect(mockUpdateSessionState).toHaveBeenCalled();
  expect(result.quality_score).toBe(90);
});
```

### Testing:
```bash
npm test -- tests/tools/runCriticReview.test.ts
```

### Success Criteria:
- All 6 tests pass
- Service interactions verified
- Session updates validated

---

## Task 0.6: Verify Full Test Suite

**Estimated Time:** 2 hours
**Status:** Not Started

### Steps:

1. **Run complete test suite:**
```bash
npm test
```

2. **Verify 100% pass rate:**
- Check for any remaining failures
- Review test output
- Confirm coverage maintained

3. **Run tests multiple times:**
```bash
# Run 5 times to ensure stability
for i in {1..5}; do npm test; done
```

4. **Check for flaky tests:**
- All runs should have identical results
- No intermittent failures
- Consistent timing

5. **Generate coverage report:**
```bash
npm test -- --coverage
```

6. **Document test metrics:**
- Total tests: XX
- Pass rate: 100%
- Coverage: XX%
- Duration: XX seconds

### Success Criteria:
- `npm test` shows all tests passing
- No flaky tests
- Coverage >= 85%
- Clean test output

---

## Completion Checklist

- [ ] Task 0.1: readOrgPolicies tests fixed
- [ ] Task 0.2: loggerService tests fixed
- [ ] Task 0.3: concurrencyLimiter tests fixed
- [ ] Task 0.4: retryHandler tests fixed
- [ ] Task 0.5: runCriticReview tests fixed
- [ ] Task 0.6: Full test suite verified
- [ ] All tests pass (100%)
- [ ] No flaky tests
- [ ] Coverage maintained
- [ ] Documentation updated

---

## Next Steps After Phase 0

Once Phase 0 is complete:
1. Commit all test fixes
2. Create git tag: `v0.9.0-stabilized`
3. Update project status document
4. Begin Phase 1: MCP Server Integration

---

## Commands Quick Reference

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/tools/readOrgPolicies.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run verbose
npm test -- --verbose

# Clear jest cache
npx jest --clearCache
```

---

**Phase 0 Ready to Execute!**

Start with Task 0.1 now.
