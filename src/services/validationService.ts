/**
 * Input Validation Service
 *
 * Provides comprehensive input validation and sanitization for MCP tools.
 * Protects against injection attacks, validates data types, and ensures data integrity.
 */

import { logger } from './loggerService';
import { metricsService } from './metricsService';

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  sanitized?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationRule {
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  [field: string]: ValidationRule;
}

export class ValidationService {
  /**
   * Validate data against a schema
   */
  validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const sanitized: any = {};

    for (const [field, rule] of Object.entries(schema)) {
      const value = data?.[field];

      // Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field,
          message: `${field} is required`,
          code: 'REQUIRED_FIELD',
        });
        continue;
      }

      // Skip validation for optional undefined fields
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      // Type validation
      if (rule.type) {
        const typeError = this.validateType(field, value, rule.type);
        if (typeError) {
          errors.push(typeError);
          continue;
        }
      }

      // String validations
      if (typeof value === 'string') {
        const stringErrors = this.validateString(field, value, rule);
        errors.push(...stringErrors);
      }

      // Number validations
      if (typeof value === 'number') {
        const numberErrors = this.validateNumber(field, value, rule);
        errors.push(...numberErrors);
      }

      // Enum validation
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({
          field,
          message: `${field} must be one of: ${rule.enum.join(', ')}`,
          code: 'INVALID_ENUM',
          value,
        });
      }

      // Custom validation
      if (rule.custom) {
        const customResult = rule.custom(value);
        if (customResult !== true) {
          errors.push({
            field,
            message: typeof customResult === 'string' ? customResult : `${field} is invalid`,
            code: 'CUSTOM_VALIDATION_FAILED',
            value,
          });
        }
      }

      // Add sanitized value
      sanitized[field] = this.sanitize(value, rule);
    }

    // Log validation failures
    if (errors.length > 0) {
      logger.warn(`Validation failed: ${errors.length} error(s)`, { errors });
      metricsService.recordError('validation_failed', 'medium');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized: errors.length === 0 ? sanitized : undefined,
    };
  }

  /**
   * Validate type
   */
  private validateType(field: string, value: any, expectedType: string): ValidationError | null {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (actualType !== expectedType) {
      return {
        field,
        message: `${field} must be of type ${expectedType}, got ${actualType}`,
        code: 'INVALID_TYPE',
        value,
      };
    }

    return null;
  }

  /**
   * Validate string
   */
  private validateString(field: string, value: string, rule: ValidationRule): ValidationError[] {
    const errors: ValidationError[] = [];

    // Min length
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push({
        field,
        message: `${field} must be at least ${rule.minLength} characters`,
        code: 'MIN_LENGTH',
        value,
      });
    }

    // Max length
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push({
        field,
        message: `${field} must be at most ${rule.maxLength} characters`,
        code: 'MAX_LENGTH',
        value,
      });
    }

    // Pattern matching
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push({
        field,
        message: `${field} format is invalid`,
        code: 'INVALID_FORMAT',
        value,
      });
    }

    return errors;
  }

  /**
   * Validate number
   */
  private validateNumber(field: string, value: number, rule: ValidationRule): ValidationError[] {
    const errors: ValidationError[] = [];

    // Min value
    if (rule.min !== undefined && value < rule.min) {
      errors.push({
        field,
        message: `${field} must be at least ${rule.min}`,
        code: 'MIN_VALUE',
        value,
      });
    }

    // Max value
    if (rule.max !== undefined && value > rule.max) {
      errors.push({
        field,
        message: `${field} must be at most ${rule.max}`,
        code: 'MAX_VALUE',
        value,
      });
    }

    return errors;
  }

  /**
   * Sanitize value based on type and rules
   */
  private sanitize(value: any, rule: ValidationRule): any {
    if (value === null || value === undefined) {
      return value;
    }

    // Trim strings
    if (typeof value === 'string') {
      return value.trim();
    }

    // Deep sanitize objects
    if (typeof value === 'object' && !Array.isArray(value)) {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = this.sanitize(val, {});
      }
      return sanitized;
    }

    // Sanitize arrays
    if (Array.isArray(value)) {
      return value.map(item => this.sanitize(item, {}));
    }

    return value;
  }

  /**
   * Validate session ID format
   */
  validateSessionId(sessionId: string): ValidationResult {
    const schema: ValidationSchema = {
      sessionId: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 100,
        pattern: /^session-[a-z0-9-]+$/,
      },
    };

    return this.validate({ sessionId }, schema);
  }

  /**
   * Validate artifact ID format
   */
  validateArtifactId(artifactId: string): ValidationResult {
    const schema: ValidationSchema = {
      artifactId: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 100,
        pattern: /^artifact-[a-z0-9-]+$/,
      },
    };

    return this.validate({ artifactId }, schema);
  }

  /**
   * Validate language
   */
  validateLanguage(language: string): ValidationResult {
    const validLanguages = [
      'python',
      'javascript',
      'typescript',
      'go',
      'java',
      'rust',
      'cpp',
      'c',
      'ruby',
      'php',
    ];

    const schema: ValidationSchema = {
      language: {
        type: 'string',
        required: true,
        enum: validLanguages,
      },
    };

    return this.validate({ language }, schema);
  }

  /**
   * Validate quality threshold
   */
  validateQualityThreshold(threshold: number): ValidationResult {
    const schema: ValidationSchema = {
      threshold: {
        type: 'number',
        required: true,
        min: 0,
        max: 100,
      },
    };

    return this.validate({ threshold }, schema);
  }

  /**
   * Validate max iterations
   */
  validateMaxIterations(maxIterations: number): ValidationResult {
    const schema: ValidationSchema = {
      maxIterations: {
        type: 'number',
        required: true,
        min: 1,
        max: 20,
      },
    };

    return this.validate({ maxIterations }, schema);
  }

  /**
   * Sanitize code input to prevent code injection
   */
  sanitizeCode(code: string): string {
    if (typeof code !== 'string') {
      return '';
    }

    // Remove null bytes
    let sanitized = code.replace(/\0/g, '');

    // Limit length (max 100KB)
    const maxLength = 100 * 1024;
    if (sanitized.length > maxLength) {
      logger.warn(`Code input truncated from ${sanitized.length} to ${maxLength} bytes`);
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize path to prevent directory traversal
   */
  sanitizePath(path: string): ValidationResult {
    if (typeof path !== 'string') {
      return {
        valid: false,
        errors: [
          {
            field: 'path',
            message: 'Path must be a string',
            code: 'INVALID_TYPE',
          },
        ],
      };
    }

    // Check for directory traversal patterns
    const dangerousPatterns = [
      /\.\./,           // Parent directory
      /~\//,            // Home directory
      /^\/etc/,         // System directories
      /^\/sys/,
      /^\/proc/,
      /^\/dev/,
      /\$\{/,           // Variable expansion
      /`/,              // Command substitution
      /\$\(/,           // Command substitution
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(path)) {
        logger.warn(`Dangerous path pattern detected: ${path}`);
        metricsService.recordError('path_traversal_attempt', 'critical');
        return {
          valid: false,
          errors: [
            {
              field: 'path',
              message: 'Path contains dangerous patterns',
              code: 'DANGEROUS_PATH',
              value: path,
            },
          ],
        };
      }
    }

    return {
      valid: true,
      sanitized: path.trim(),
    };
  }

  /**
   * Sanitize SQL to detect injection attempts
   * Note: This is a basic check. Use parameterized queries instead!
   */
  detectSqlInjection(input: string): boolean {
    if (typeof input !== 'string') {
      return false;
    }

    const sqlPatterns = [
      /(\bor\b|\band\b).*=.*=/i,           // OR/AND with equality
      /union.*select/i,                     // UNION SELECT
      /select.*from/i,                      // SELECT FROM
      /insert.*into/i,                      // INSERT INTO
      /update.*set/i,                       // UPDATE SET
      /delete.*from/i,                      // DELETE FROM
      /drop.*table/i,                       // DROP TABLE
      /exec(\s|\()/i,                       // EXEC
      /execute(\s|\()/i,                    // EXECUTE
      /script>/i,                           // XSS
      /javascript:/i,                       // XSS
      /on\w+\s*=/i,                        // Event handlers
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(input)) {
        logger.error(`SQL injection attempt detected: ${input.substring(0, 100)}`);
        metricsService.recordError('sql_injection_attempt', 'critical');
        return true;
      }
    }

    return false;
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): ValidationResult {
    const schema: ValidationSchema = {
      email: {
        type: 'string',
        required: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      },
    };

    return this.validate({ email }, schema);
  }

  /**
   * Validate URL format
   */
  validateUrl(url: string): ValidationResult {
    const schema: ValidationSchema = {
      url: {
        type: 'string',
        required: true,
        custom: (value: string) => {
          try {
            new URL(value);
            return true;
          } catch {
            return 'Invalid URL format';
          }
        },
      },
    };

    return this.validate({ url }, schema);
  }

  /**
   * Validate task specification
   */
  validateTaskSpec(spec: any): ValidationResult {
    const schema: ValidationSchema = {
      description: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 10000,
        custom: (value: string) => {
          // Check for SQL injection
          if (this.detectSqlInjection(value)) {
            return 'Description contains suspicious patterns';
          }
          return true;
        },
      },
      language: {
        type: 'string',
        required: true,
        enum: ['python', 'javascript', 'typescript', 'go', 'java', 'rust', 'cpp'],
      },
      framework: {
        type: 'string',
        required: false,
        maxLength: 50,
      },
      context: {
        type: 'string',
        required: false,
        maxLength: 5000,
      },
      test_framework: {
        type: 'string',
        required: false,
        maxLength: 50,
      },
    };

    return this.validate(spec, schema);
  }

  /**
   * Validate tool arguments based on tool name
   */
  validateToolArgs(toolName: string, args: any): ValidationResult {
    switch (toolName) {
      case 'execute_task_spec':
        return this.validateExecuteTaskSpecArgs(args);

      case 'run_critic_review':
        return this.validateRunCriticReviewArgs(args);

      case 'revise_code':
        return this.validateReviseCodeArgs(args);

      case 'get_repo_map':
        return this.validateGetRepoMapArgs(args);

      case 'get_project_status':
      case 'get_progress_summary':
      case 'final_handoff_archive':
        return this.validateSessionIdArgs(args);

      default:
        // No specific validation for this tool
        return { valid: true, sanitized: args };
    }
  }

  /**
   * Validate execute_task_spec arguments
   */
  private validateExecuteTaskSpecArgs(args: any): ValidationResult {
    const schema: ValidationSchema = {
      spec: {
        type: 'object',
        required: true,
      },
      max_iterations: {
        type: 'number',
        required: false,
        min: 1,
        max: 20,
      },
      quality_threshold: {
        type: 'number',
        required: false,
        min: 0,
        max: 100,
      },
    };

    const basicValidation = this.validate(args, schema);
    if (!basicValidation.valid) {
      return basicValidation;
    }

    // Validate spec object
    const specValidation = this.validateTaskSpec(args.spec);
    if (!specValidation.valid) {
      return {
        valid: false,
        errors: specValidation.errors?.map(error => ({
          ...error,
          field: `spec.${error.field}`,
        })),
      };
    }

    return { valid: true, sanitized: basicValidation.sanitized };
  }

  /**
   * Validate run_critic_review arguments
   */
  private validateRunCriticReviewArgs(args: any): ValidationResult {
    const schema: ValidationSchema = {
      session_id: {
        type: 'string',
        required: true,
        pattern: /^session-[a-z0-9-]+$/,
      },
      artifact_id: {
        type: 'string',
        required: true,
        pattern: /^artifact-[a-z0-9-]+$/,
      },
      review_depth: {
        type: 'string',
        required: false,
        enum: ['quick', 'standard', 'comprehensive'],
      },
    };

    return this.validate(args, schema);
  }

  /**
   * Validate revise_code arguments
   */
  private validateReviseCodeArgs(args: any): ValidationResult {
    const schema: ValidationSchema = {
      session_id: {
        type: 'string',
        required: true,
        pattern: /^session-[a-z0-9-]+$/,
      },
      feedback: {
        type: 'object',
        required: true,
      },
    };

    return this.validate(args, schema);
  }

  /**
   * Validate get_repo_map arguments
   */
  private validateGetRepoMapArgs(args: any): ValidationResult {
    const schema: ValidationSchema = {
      repo_path: {
        type: 'string',
        required: true,
        maxLength: 500,
        custom: (value: string) => {
          const pathValidation = this.sanitizePath(value);
          return pathValidation.valid || 'Invalid repository path';
        },
      },
      include_tests: {
        type: 'boolean',
        required: false,
      },
    };

    return this.validate(args, schema);
  }

  /**
   * Validate session ID arguments
   */
  private validateSessionIdArgs(args: any): ValidationResult {
    const schema: ValidationSchema = {
      session_id: {
        type: 'string',
        required: true,
        pattern: /^session-[a-z0-9-]+$/,
      },
    };

    return this.validate(args, schema);
  }
}

// Singleton instance
export const validationService = new ValidationService();
