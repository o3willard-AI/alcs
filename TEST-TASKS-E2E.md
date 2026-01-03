# ALCS End-to-End Test Tasks

**Purpose:** Verify ALCS dual-agent functionality with Ollama LLMs
**Ollama Server:** 192.168.101.85:11434
**Agent Alpha:** qwen2.5-coder:32b
**Agent Beta:** deepseek-r1:14b

## Test Task 1: Simple Function Implementation

### Objective
Verify basic code generation and review loop with a simple algorithmic task.

### Task Specification
```json
{
  "task_type": "implement_function",
  "description": "Implement a Python function that checks if a string is a palindrome",
  "requirements": [
    "Function name: is_palindrome",
    "Input: string",
    "Output: boolean",
    "Handle edge cases: empty string, single character, case-insensitive",
    "Include docstring",
    "Include 3 test cases"
  ],
  "language": "python",
  "quality_threshold": 0.7
}
```

### Expected Behavior

**Iteration 1:**
- Agent Alpha generates basic palindrome function
- Agent Beta reviews: likely finds missing edge cases or documentation
- Quality score: ~0.5-0.6

**Iteration 2:**
- Agent Alpha adds edge case handling based on feedback
- Agent Beta reviews: checks test coverage
- Quality score: ~0.6-0.7

**Iteration 3:**
- Agent Alpha adds comprehensive tests and documentation
- Agent Beta reviews: verifies completeness
- Quality score: ~0.75-0.85
- **CONVERGED**

### Success Criteria

✅ **Code Quality:**
- [ ] Function handles all edge cases
- [ ] Proper docstring present
- [ ] At least 3 test cases included
- [ ] Code is readable and well-structured

✅ **Process Quality:**
- [ ] Alpha and Beta agents invoked
- [ ] Multiple iterations occurred (2-3)
- [ ] Quality score improved over iterations
- [ ] Final score > 0.7
- [ ] Converged state reached

✅ **Performance:**
- [ ] Completed in < 5 minutes
- [ ] Used < 5 iterations
- [ ] No stagnation detected

### Verification Method

1. **Automated:**
   - Check final quality score >= 0.7
   - Verify iteration count in range [2, 5]
   - Confirm state is CONVERGED
   - Run generated tests (should pass)

2. **Manual:**
   - Review generated code for correctness
   - Verify edge cases are handled
   - Check code readability
   - Assess review feedback quality

### Expected Output Example

```python
def is_palindrome(s: str) -> bool:
    """
    Check if a string is a palindrome (reads the same forwards and backwards).

    Args:
        s: Input string to check

    Returns:
        True if string is a palindrome, False otherwise

    Examples:
        >>> is_palindrome("racecar")
        True
        >>> is_palindrome("hello")
        False
        >>> is_palindrome("")
        True
    """
    # Handle edge cases
    if not s:
        return True

    # Convert to lowercase for case-insensitive comparison
    s_clean = s.lower()

    # Check if string equals its reverse
    return s_clean == s_clean[::-1]


# Test cases
def test_is_palindrome():
    assert is_palindrome("racecar") == True
    assert is_palindrome("hello") == False
    assert is_palindrome("") == True
    assert is_palindrome("A") == True
    assert is_palindrome("Racecar") == True  # Case-insensitive
    print("All tests passed!")

if __name__ == "__main__":
    test_is_palindrome()
```

---

## Test Task 2: API Endpoint Implementation

### Objective
Test complex code generation with multiple components and error handling.

### Task Specification
```json
{
  "task_type": "implement_api",
  "description": "Create a FastAPI endpoint for user registration",
  "requirements": [
    "POST /api/users/register endpoint",
    "Request body: username, email, password",
    "Input validation: email format, password strength",
    "Error handling: duplicate user, invalid input",
    "Response: user ID and success message",
    "Include Pydantic models",
    "Include 2 test cases (success and failure)"
  ],
  "language": "python",
  "framework": "fastapi",
  "quality_threshold": 0.75
}
```

### Expected Behavior

**Iteration 1:**
- Agent Alpha generates basic endpoint structure
- Agent Beta reviews: finds missing validation, error handling
- Quality score: ~0.4-0.5

**Iteration 2:**
- Agent Alpha adds input validation with Pydantic
- Agent Beta reviews: notes weak password validation, missing tests
- Quality score: ~0.55-0.65

**Iteration 3:**
- Agent Alpha adds strong password validation and error responses
- Agent Beta reviews: requests test cases
- Quality score: ~0.65-0.75

**Iteration 4:**
- Agent Alpha adds comprehensive tests
- Agent Beta reviews: verifies completeness
- Quality score: ~0.78-0.85
- **CONVERGED**

### Success Criteria

✅ **Code Quality:**
- [ ] FastAPI endpoint properly defined
- [ ] Pydantic models for request/response
- [ ] Email validation (regex)
- [ ] Password strength validation
- [ ] Error handling for edge cases
- [ ] At least 2 test cases (pytest)

✅ **Process Quality:**
- [ ] 3-4 iterations occurred
- [ ] Progressive refinement visible
- [ ] Review feedback incorporated
- [ ] Final score > 0.75

✅ **Performance:**
- [ ] Completed in < 10 minutes
- [ ] Used < 6 iterations

### Verification Method

1. **Automated:**
   - Parse code for required components
   - Run generated tests (should pass)
   - Check quality score progression
   - Verify no security issues (basic)

2. **Manual:**
   - Review validation logic
   - Check error handling completeness
   - Assess code organization
   - Verify FastAPI best practices

### Expected Output Example

```python
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, EmailStr, validator
import re

app = FastAPI()

class UserRegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

    @validator('password')
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain uppercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain a number')
        return v

class UserRegisterResponse(BaseModel):
    user_id: int
    message: str

# Simulated database
users_db = {}

@app.post("/api/users/register", response_model=UserRegisterResponse)
async def register_user(user: UserRegisterRequest):
    # Check for duplicate
    if user.username in users_db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists"
        )

    # Create user
    user_id = len(users_db) + 1
    users_db[user.username] = {
        "id": user_id,
        "email": user.email,
        "password_hash": hash(user.password)  # Use proper hashing in production
    }

    return UserRegisterResponse(
        user_id=user_id,
        message="User registered successfully"
    )

# Tests
def test_register_success():
    from fastapi.testclient import TestClient
    client = TestClient(app)

    response = client.post("/api/users/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "SecurePass123"
    })

    assert response.status_code == 200
    assert "user_id" in response.json()

def test_register_duplicate():
    from fastapi.testclient import TestClient
    client = TestClient(app)

    # Register first user
    client.post("/api/users/register", json={
        "username": "duplicate",
        "email": "dup@example.com",
        "password": "SecurePass123"
    })

    # Try to register again
    response = client.post("/api/users/register", json={
        "username": "duplicate",
        "email": "dup2@example.com",
        "password": "SecurePass456"
    })

    assert response.status_code == 409
```

---

## Test Task 3: Code Refactoring with Quality Improvement

### Objective
Test the review-revise loop's ability to improve existing "bad" code.

### Task Specification
```json
{
  "task_type": "refactor_code",
  "description": "Refactor provided code to improve quality",
  "initial_code": "def calc(a,b,op):\n  if op=='+':\n    return a+b\n  elif op=='-':\n    return a-b\n  elif op=='*':\n    return a*b\n  elif op=='/':\n    return a/b",
  "requirements": [
    "Add type hints",
    "Add docstring",
    "Handle division by zero",
    "Use match/case (Python 3.10+)",
    "Add input validation",
    "Add comprehensive tests",
    "Improve naming"
  ],
  "language": "python",
  "quality_threshold": 0.8,
  "initial_quality": 0.3
}
```

### Expected Behavior

**Iteration 1:**
- Agent Alpha receives low-quality code (score: 0.3)
- Agent Beta reviews: identifies multiple issues (no docstring, no type hints, no error handling, poor naming)
- Agent Alpha refactors with basic improvements
- Quality score: ~0.5-0.6

**Iteration 2:**
- Agent Beta reviews: notes missing division-by-zero handling
- Agent Alpha adds error handling
- Quality score: ~0.65-0.75

**Iteration 3:**
- Agent Beta reviews: requests tests and improved error messages
- Agent Alpha adds comprehensive tests
- Quality score: ~0.75-0.85

**Iteration 4:**
- Agent Beta reviews: suggests using match/case for clarity
- Agent Alpha refactors to use match/case
- Quality score: ~0.82-0.88
- **CONVERGED**

### Success Criteria

✅ **Code Quality:**
- [ ] Type hints on all parameters and return
- [ ] Comprehensive docstring
- [ ] Division by zero handling
- [ ] Uses match/case statement
- [ ] Input validation (operator validity)
- [ ] At least 5 test cases
- [ ] Descriptive function and parameter names

✅ **Process Quality:**
- [ ] Initial quality score < 0.4
- [ ] Final quality score > 0.8
- [ ] Clear improvement progression
- [ ] 3-4 iterations
- [ ] Specific, actionable feedback from Beta

✅ **Quality Improvement:**
- [ ] Score improvement >= 0.5
- [ ] All original issues addressed
- [ ] No new issues introduced

### Verification Method

1. **Automated:**
   - Run mypy type checking (should pass)
   - Run generated tests (all pass)
   - Check quality score progression
   - Verify score delta >= 0.5

2. **Manual:**
   - Compare original vs final code
   - Verify all requirements met
   - Check review feedback quality
   - Assess clarity and maintainability

### Expected Output Example

```python
from typing import Union, Literal

def calculate(
    operand_a: Union[int, float],
    operand_b: Union[int, float],
    operation: Literal['+', '-', '*', '/']
) -> Union[int, float]:
    """
    Perform basic arithmetic operation on two numbers.

    Args:
        operand_a: First operand
        operand_b: Second operand
        operation: Arithmetic operation (+, -, *, /)

    Returns:
        Result of the arithmetic operation

    Raises:
        ValueError: If operation is invalid
        ZeroDivisionError: If attempting to divide by zero

    Examples:
        >>> calculate(5, 3, '+')
        8
        >>> calculate(10, 2, '/')
        5.0
    """
    # Validate operation
    valid_operations = {'+', '-', '*', '/'}
    if operation not in valid_operations:
        raise ValueError(f"Invalid operation: {operation}. Must be one of {valid_operations}")

    # Perform calculation using match/case
    match operation:
        case '+':
            return operand_a + operand_b
        case '-':
            return operand_a - operand_b
        case '*':
            return operand_a * operand_b
        case '/':
            if operand_b == 0:
                raise ZeroDivisionError("Cannot divide by zero")
            return operand_a / operand_b
        case _:
            raise ValueError(f"Unexpected operation: {operation}")


# Comprehensive test suite
def test_addition():
    assert calculate(5, 3, '+') == 8
    assert calculate(-2, 7, '+') == 5

def test_subtraction():
    assert calculate(10, 4, '-') == 6
    assert calculate(3, 8, '-') == -5

def test_multiplication():
    assert calculate(6, 7, '*') == 42
    assert calculate(-3, 4, '*') == -12

def test_division():
    assert calculate(10, 2, '/') == 5.0
    assert calculate(7, 2, '/') == 3.5

def test_division_by_zero():
    try:
        calculate(5, 0, '/')
        assert False, "Should have raised ZeroDivisionError"
    except ZeroDivisionError as e:
        assert "Cannot divide by zero" in str(e)

def test_invalid_operation():
    try:
        calculate(5, 3, '%')
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "Invalid operation" in str(e)

if __name__ == "__main__":
    # Run all tests
    test_addition()
    test_subtraction()
    test_multiplication()
    test_division()
    test_division_by_zero()
    test_invalid_operation()
    print("All tests passed!")
```

---

## Test Execution Plan

### Prerequisites
- [ ] ALCS MCP server running
- [ ] Ollama server accessible at 192.168.101.85:11434
- [ ] qwen2.5-coder:32b and deepseek-r1:14b loaded
- [ ] Database (PostgreSQL) available OR in-memory mode
- [ ] Python environment for running generated code

### Execution Order
1. **Test Task 1** (Simple) - 5-10 minutes
2. **Test Task 3** (Refactoring) - 10-15 minutes
3. **Test Task 2** (Complex) - 15-20 minutes

### Data Collection

For each test, record:
- Start time and end time
- Number of iterations
- Quality scores at each iteration
- Review feedback from Agent Beta
- Final generated code
- Test execution results
- Any errors or failures
- Agent response times

### Pass/Fail Criteria

**Overall Test Suite Passes If:**
- [ ] At least 2 of 3 tests pass
- [ ] All passing tests reach convergence
- [ ] Quality scores show improvement
- [ ] Generated code runs without errors
- [ ] No system crashes or hangs

**Individual Test Passes If:**
- [ ] Meets all success criteria
- [ ] Quality score >= threshold
- [ ] Code runs and tests pass
- [ ] Completed within time limit

## Alternative: Direct Ollama Testing

If MCP server cannot run due to build errors, test directly:

```bash
# Test Agent Alpha (Generation)
curl -X POST http://192.168.101.85:11434/api/generate \
  -d '{
    "model": "qwen2.5-coder:32b",
    "prompt": "Write a Python function to check if a string is a palindrome. Include tests.",
    "stream": false
  }'

# Test Agent Beta (Review)
curl -X POST http://192.168.101.85:11434/api/generate \
  -d '{
    "model": "deepseek-r1:14b",
    "prompt": "Review this code and provide feedback: [code here]",
    "stream": false
  }'
```

This validates:
- Ollama server connectivity
- Model availability and performance
- Code generation quality
- Review feedback quality

## Next Steps

**Option A: Fix Build and Run Full Tests** (6-8 hours)
- Fix TypeScript compilation errors
- Set up PostgreSQL
- Run all 3 test tasks via MCP
- Generate comprehensive report

**Option B: Direct Testing** (1-2 hours)
- Test Ollama models directly
- Manual iteration simulation
- Basic functionality verification
- Document findings

**Your Decision Needed:** Which approach should we proceed with?
