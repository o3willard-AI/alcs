# ALCS Input Validation Guide

This guide covers input validation and security protections implemented in the ALCS MCP Server.

## Overview

Input validation protects ALCS from:
- **Code injection** - SQL, NoSQL, command injection
- **Path traversal** - Directory traversal attacks
- **XSS attacks** - Cross-site scripting
- **Invalid data** - Type errors, range violations
- **Malformed inputs** - Corrupted or malicious data

All MCP tool inputs are validated and sanitized before execution.

## Validation Features

### 1. **Type Validation**

Ensures values match expected types:

```typescript
// Valid
{ language: "python" }  ✓

// Invalid
{ language: 123 }  ✗ "language must be of type string, got number"
```

### 2. **Required Fields**

Ensures critical fields are present:

```typescript
// Valid
{ session_id: "session-abc123" }  ✓

// Invalid
{}  ✗ "session_id is required"
```

### 3. **String Validation**

- **Min/Max length** - Prevents buffer overflows
- **Pattern matching** - Validates formats (IDs, emails, URLs)
- **Trimming** - Removes leading/trailing whitespace

```typescript
// Valid
{ description: "Create a REST API..." }  ✓ (10+ chars)

// Invalid
{ description: "hi" }  ✗ "description must be at least 10 characters"
```

### 4. **Number Validation**

- **Min/Max values** - Enforces ranges
- **Integer vs Float** - Type checking

```typescript
// Valid
{ quality_threshold: 85 }  ✓ (0-100)

// Invalid
{ quality_threshold: 150 }  ✗ "quality_threshold must be at most 100"
```

### 5. **Enum Validation**

Ensures values are from allowed set:

```typescript
// Valid
{ language: "python" }  ✓

// Invalid
{ language: "fortran" }  ✗ "language must be one of: python, javascript, ..."
```

### 6. **Custom Validation**

Complex validation logic:

```typescript
// Path traversal detection
{ repo_path: "../../../etc/passwd" }  ✗ "Path contains dangerous patterns"

// SQL injection detection
{ description: "'; DROP TABLE users; --" }  ✗ "Contains suspicious patterns"
```

## Validated Tools

### execute_task_spec

```typescript
{
  spec: {
    description: string,     // Required, 10-10000 chars, checked for injection
    language: string,        // Required, enum of supported languages
    framework?: string,      // Optional, max 50 chars
    context?: string,        // Optional, max 5000 chars
    test_framework?: string  // Optional, max 50 chars
  },
  max_iterations?: number,   // Optional, 1-20
  quality_threshold?: number // Optional, 0-100
}
```

**Validation Rules:**
- Description: Min 10 chars, max 10KB, SQL injection check
- Language: Must be in `[python, javascript, typescript, go, java, rust, cpp]`
- Max iterations: 1-20 range
- Quality threshold: 0-100 range

### run_critic_review

```typescript
{
  session_id: string,    // Required, format: "session-[a-z0-9-]+"
  artifact_id: string,   // Required, format: "artifact-[a-z0-9-]+"
  review_depth?: string  // Optional, enum: [quick, standard, comprehensive]
}
```

### get_repo_map

```typescript
{
  repo_path: string,     // Required, path traversal check
  include_tests?: boolean // Optional
}
```

**Security Checks:**
- No `../` (parent directory)
- No `~/` (home directory)
- No system paths (`/etc`, `/sys`, `/proc`, `/dev`)
- No variable expansion (`${`, `` ` ``, `$(`)

### Session ID Tools

Tools like `get_project_status`, `get_progress_summary`, `final_handoff_archive`:

```typescript
{
  session_id: string  // Required, format: "session-[a-z0-9-]+"
}
```

## Security Protections

### 1. **SQL Injection Detection**

Detects common SQL injection patterns:

```sql
-- Detected patterns:
OR 1=1
UNION SELECT
DROP TABLE
'; DELETE FROM
INSERT INTO
EXEC(
```

**Example:**
```typescript
// Input
{ description: "Create user with id = 1 OR 1=1" }

// Result
✗ "Description contains suspicious patterns"
```

### 2. **Path Traversal Prevention**

Blocks directory traversal attempts:

```bash
# Blocked patterns:
../              # Parent directory
~/               # Home directory
/etc/            # System directories
/sys/
/proc/
/dev/
${HOME}          # Variable expansion
`whoami`         # Command substitution
$(ls)            # Command substitution
```

**Example:**
```typescript
// Input
{ repo_path: "../../etc/passwd" }

// Result
✗ "Path contains dangerous patterns"
+ Logged as critical security event
+ Metrics recorded
```

### 3. **XSS Prevention**

Detects cross-site scripting attempts:

```html
<!-- Detected patterns -->
<script>
javascript:
onload=
onerror=
```

### 4. **Code Sanitization**

Sanitizes code inputs:

```typescript
// Remove null bytes
code.replace(/\0/g, '')

// Limit length (max 100KB)
code.substring(0, 100 * 1024)
```

### 5. **String Trimming**

Removes leading/trailing whitespace:

```typescript
// Input
{ language: "  python  " }

// Sanitized
{ language: "python" }
```

## Validation Errors

### Error Format

```json
{
  "valid": false,
  "errors": [
    {
      "field": "spec.description",
      "message": "description must be at least 10 characters",
      "code": "MIN_LENGTH",
      "value": "hi"
    }
  ]
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `REQUIRED_FIELD` | Missing required field |
| `INVALID_TYPE` | Wrong data type |
| `MIN_LENGTH` | String too short |
| `MAX_LENGTH` | String too long |
| `MIN_VALUE` | Number too small |
| `MAX_VALUE` | Number too large |
| `INVALID_FORMAT` | Pattern mismatch |
| `INVALID_ENUM` | Not in allowed values |
| `CUSTOM_VALIDATION_FAILED` | Custom rule failed |
| `DANGEROUS_PATH` | Path traversal detected |

### MCP Error Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\": \"Invalid arguments: spec.description: description must be at least 10 characters\"}"
    }
  ],
  "isError": true
}
```

## Custom Validation

### Adding New Validators

```typescript
import { validationService } from './services/validationService';

// Add to ValidationService class
validateCustomField(value: string): ValidationResult {
  const schema: ValidationSchema = {
    customField: {
      type: 'string',
      required: true,
      custom: (val: string) => {
        // Custom validation logic
        if (val.includes('forbidden')) {
          return 'Contains forbidden word';
        }
        return true;
      }
    }
  };

  return this.validate({ customField: value }, schema);
}
```

### Extending Tool Validation

```typescript
// In validationService.ts
case 'my_custom_tool':
  return this.validateMyCustomToolArgs(args);

private validateMyCustomToolArgs(args: any): ValidationResult {
  const schema: ValidationSchema = {
    // Define validation schema
  };

  return this.validate(args, schema);
}
```

## Testing Validation

### Valid Input

```bash
curl -X POST http://localhost:9090 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute_task_spec",
      "arguments": {
        "spec": {
          "description": "Create a REST API with authentication",
          "language": "python"
        }
      }
    }
  }'

# Response: Success ✓
```

### Invalid Input

```bash
curl -X POST http://localhost:9090 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute_task_spec",
      "arguments": {
        "spec": {
          "description": "hi",
          "language": "fortran"
        }
      }
    }
  }'

# Response: Validation Error ✗
{
  "error": "Invalid arguments: spec.description: description must be at least 10 characters, spec.language: language must be one of: python, javascript, typescript, go, java, rust, cpp"
}
```

## Monitoring

### Prometheus Metrics

```promql
# Validation failures
rate(alcs_errors_total{type="validation_failed"}[5m])

# Tool validation failures
rate(alcs_errors_total{type="tool_validation_failed"}[5m])

# Security events (SQL injection, path traversal)
rate(alcs_errors_total{type=~"sql_injection_attempt|path_traversal_attempt"}[5m])
```

### Log Messages

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "warn",
  "message": "Validation failed: 2 error(s)",
  "service": "alcs",
  "errors": [
    {
      "field": "spec.description",
      "message": "description must be at least 10 characters",
      "code": "MIN_LENGTH"
    }
  ]
}
```

### Security Alerts

Critical security events are logged and tracked:

```json
{
  "level": "error",
  "message": "SQL injection attempt detected",
  "input": "'; DROP TABLE users; --",
  "type": "sql_injection_attempt"
}
```

## Best Practices

### 1. **Validate at Boundaries**

Validate all external inputs:
- MCP tool arguments
- HTTP request parameters
- User-provided data

### 2. **Fail Securely**

Return clear errors without leaking sensitive information:

```typescript
// Good
"Invalid session ID format"

// Bad
"Session 'session-abc123' not found in database table 'sessions'"
```

### 3. **Use Allowlists**

Prefer allowlists over blocklists:

```typescript
// Good: Allowlist
enum: ['python', 'javascript', 'typescript']

// Bad: Blocklist
if (language === 'assembly' || language === 'binary') { reject(); }
```

### 4. **Sanitize Everything**

Always sanitize inputs, even after validation:

```typescript
const sanitized = input.trim()
                      .replace(/\0/g, '')
                      .substring(0, MAX_LENGTH);
```

### 5. **Log Security Events**

Track suspicious patterns:

```typescript
if (detectSqlInjection(input)) {
  logger.error('SQL injection attempt detected', { input });
  metricsService.recordError('sql_injection_attempt', 'critical');
}
```

## Limitations

### Current Implementation

- **In-memory validation** - No persistent blocklist
- **Pattern-based detection** - May have false positives/negatives
- **Synchronous** - Validation blocks request processing

### Recommendations

1. **Use parameterized queries** - Never concatenate SQL
2. **Sandbox code execution** - Isolate test runs
3. **Rate limit validation failures** - Prevent brute force
4. **Monitor patterns** - Detect attack campaigns

## Additional Resources

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Authentication Guide](./AUTHENTICATION.md)
- [Rate Limiting Guide](./RATE-LIMITING.md)
- [Security Best Practices](./SECURITY.md)
