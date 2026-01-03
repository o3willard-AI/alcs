/**
 * Authentication Service
 *
 * Provides API key and JWT authentication for the MCP server.
 * Supports multiple authentication strategies and session management.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from './loggerService';
import { metricsService } from './metricsService';

export interface AuthConfig {
  enabled: boolean;
  apiKey?: string;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  allowedOrigins?: string[];
}

export interface AuthContext {
  authenticated: boolean;
  method?: 'api_key' | 'jwt';
  userId?: string;
  permissions?: string[];
  expiresAt?: Date;
}

export interface JWTPayload {
  sub: string; // User ID
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export class AuthService {
  private config: AuthConfig;
  private apiKeyHash?: string;

  constructor(config: AuthConfig) {
    this.config = config;

    // Hash the API key for secure comparison
    if (config.apiKey) {
      this.apiKeyHash = this.hashApiKey(config.apiKey);
      logger.info('AuthService initialized with API key authentication');
    }

    if (config.jwtSecret) {
      logger.info('AuthService initialized with JWT authentication');
    }

    if (!config.enabled) {
      logger.warn('Authentication is DISABLED - this should only be used in development!');
    }
  }

  /**
   * Authenticate a request using the provided credentials
   * @param authHeader Authorization header value
   * @returns Authentication context
   */
  async authenticate(authHeader?: string): Promise<AuthContext> {
    // If authentication is disabled, allow all requests
    if (!this.config.enabled) {
      return {
        authenticated: true,
        method: undefined,
        userId: 'anonymous',
      };
    }

    // No auth header provided
    if (!authHeader) {
      logger.warn('Authentication failed: No authorization header provided');
      metricsService.recordError('auth_missing_header', 'medium');
      return { authenticated: false };
    }

    // Parse authorization header
    const [scheme, credentials] = authHeader.split(' ');

    if (!scheme || !credentials) {
      logger.warn('Authentication failed: Invalid authorization header format');
      metricsService.recordError('auth_invalid_format', 'medium');
      return { authenticated: false };
    }

    // Try different authentication methods
    try {
      switch (scheme.toLowerCase()) {
        case 'bearer':
          // Try JWT first, then API key
          if (this.config.jwtSecret) {
            const jwtResult = await this.authenticateJWT(credentials);
            if (jwtResult.authenticated) {
              return jwtResult;
            }
          }
          // Fallback to API key authentication with Bearer token
          if (this.config.apiKey) {
            return await this.authenticateApiKey(credentials);
          }
          break;

        case 'apikey':
          return await this.authenticateApiKey(credentials);

        default:
          logger.warn(`Authentication failed: Unsupported scheme "${scheme}"`);
          metricsService.recordError('auth_unsupported_scheme', 'medium');
          return { authenticated: false };
      }
    } catch (error: any) {
      logger.error(`Authentication error: ${error.message}`);
      metricsService.recordError('auth_exception', 'high');
      return { authenticated: false };
    }

    logger.warn('Authentication failed: Invalid credentials');
    metricsService.recordError('auth_invalid_credentials', 'medium');
    return { authenticated: false };
  }

  /**
   * Authenticate using API key
   */
  private async authenticateApiKey(apiKey: string): Promise<AuthContext> {
    if (!this.config.apiKey || !this.apiKeyHash) {
      return { authenticated: false };
    }

    const providedKeyHash = this.hashApiKey(apiKey);

    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedKeyHash),
      Buffer.from(this.apiKeyHash)
    );

    if (isValid) {
      logger.debug('API key authentication successful');
      return {
        authenticated: true,
        method: 'api_key',
        userId: 'api_key_user',
        permissions: ['*'], // API key has full permissions
      };
    }

    logger.warn('API key authentication failed: Invalid key');
    metricsService.recordError('auth_invalid_api_key', 'medium');
    return { authenticated: false };
  }

  /**
   * Authenticate using JWT token
   */
  private async authenticateJWT(token: string): Promise<AuthContext> {
    if (!this.config.jwtSecret) {
      return { authenticated: false };
    }

    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as JWTPayload;

      logger.debug(`JWT authentication successful for user: ${payload.sub}`);

      return {
        authenticated: true,
        method: 'jwt',
        userId: payload.sub,
        permissions: payload.permissions || [],
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('JWT authentication failed: Token expired');
        metricsService.recordError('auth_jwt_expired', 'low');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn(`JWT authentication failed: ${error.message}`);
        metricsService.recordError('auth_jwt_invalid', 'medium');
      } else {
        logger.error(`JWT authentication error: ${error.message}`);
        metricsService.recordError('auth_jwt_error', 'high');
      }
      return { authenticated: false };
    }
  }

  /**
   * Generate a JWT token for a user
   * @param userId User ID
   * @param permissions Optional permissions array
   * @returns JWT token
   */
  generateToken(userId: string, permissions?: string[]): string {
    if (!this.config.jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    const payload: JWTPayload = {
      sub: userId,
      permissions,
    };

    const token = jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiresIn || '24h',
    } as any);

    logger.info(`Generated JWT token for user: ${userId}`);
    return token;
  }

  /**
   * Validate if a user has the required permissions
   * @param context Auth context
   * @param requiredPermissions Required permissions
   * @returns True if user has all required permissions
   */
  hasPermissions(context: AuthContext, requiredPermissions: string[]): boolean {
    if (!context.authenticated) {
      return false;
    }

    // Wildcard permission grants everything
    if (context.permissions?.includes('*')) {
      return true;
    }

    // Check if user has all required permissions
    return requiredPermissions.every(
      (required) => context.permissions?.includes(required)
    );
  }

  /**
   * Hash an API key for secure storage/comparison
   */
  private hashApiKey(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');
  }

  /**
   * Generate a secure random API key
   * @param length Length of the API key (default: 32)
   * @returns Base64-encoded API key
   */
  static generateApiKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Check if authentication is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create auth service instance from environment variables
 */
export function createAuthService(): AuthService {
  const config: AuthConfig = {
    enabled: process.env.ENABLE_AUTHENTICATION === 'true',
    apiKey: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(','),
  };

  return new AuthService(config);
}

// Singleton instance
export const authService = createAuthService();
