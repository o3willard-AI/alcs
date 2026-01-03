#!/usr/bin/env tsx
/**
 * Authentication Credentials Generator
 *
 * CLI utility to generate API keys and JWT tokens for ALCS authentication.
 * Usage:
 *   npm run auth:generate-api-key
 *   npm run auth:generate-jwt <userId> [permissions]
 */

import { AuthService } from '../src/services/authService';
import crypto from 'crypto';

const args = process.argv.slice(2);
const command = args[0];

/**
 * Generate a secure API key
 */
function generateApiKey(): void {
  const apiKey = AuthService.generateApiKey(32);

  console.log('\n=== API Key Generated ===');
  console.log('\nAPI Key:');
  console.log(apiKey);
  console.log('\nAdd this to your .env file:');
  console.log(`API_KEY=${apiKey}`);
  console.log('\nClients can authenticate using this API key:');
  console.log('Authorization: Bearer ' + apiKey);
  console.log('  or');
  console.log('Authorization: ApiKey ' + apiKey);
  console.log('\n========================\n');
}

/**
 * Generate a JWT secret
 */
function generateJwtSecret(): void {
  const secret = crypto.randomBytes(64).toString('hex');

  console.log('\n=== JWT Secret Generated ===');
  console.log('\nJWT Secret:');
  console.log(secret);
  console.log('\nAdd this to your .env file:');
  console.log(`JWT_SECRET=${secret}`);
  console.log('\n===========================\n');
}

/**
 * Generate a JWT token for a user
 */
function generateJwtToken(userId: string, permissions?: string[]): void {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('Error: JWT_SECRET environment variable not set');
    console.error('Run: npm run auth:generate-jwt-secret first');
    process.exit(1);
  }

  const authService = new AuthService({
    enabled: true,
    jwtSecret,
    jwtExpiresIn: '24h',
  });

  const token = authService.generateToken(userId, permissions);

  console.log('\n=== JWT Token Generated ===');
  console.log(`\nUser ID: ${userId}`);
  if (permissions && permissions.length > 0) {
    console.log(`Permissions: ${permissions.join(', ')}`);
  }
  console.log('\nJWT Token:');
  console.log(token);
  console.log('\nClients can authenticate using this token:');
  console.log('Authorization: Bearer ' + token);
  console.log('\nToken expires in: 24 hours');
  console.log('\n==========================\n');
}

/**
 * Show usage information
 */
function showUsage(): void {
  console.log('\nALCS Authentication Credentials Generator\n');
  console.log('Usage:');
  console.log('  tsx scripts/generate-auth-credentials.ts <command> [options]\n');
  console.log('Commands:');
  console.log('  api-key                    Generate a new API key');
  console.log('  jwt-secret                 Generate a new JWT secret');
  console.log('  jwt-token <userId> [perms] Generate a JWT token for a user\n');
  console.log('Examples:');
  console.log('  tsx scripts/generate-auth-credentials.ts api-key');
  console.log('  tsx scripts/generate-auth-credentials.ts jwt-secret');
  console.log('  tsx scripts/generate-auth-credentials.ts jwt-token admin');
  console.log('  tsx scripts/generate-auth-credentials.ts jwt-token user1 read,write\n');
}

// Main execution
switch (command) {
  case 'api-key':
    generateApiKey();
    break;

  case 'jwt-secret':
    generateJwtSecret();
    break;

  case 'jwt-token': {
    const userId = args[1];
    if (!userId) {
      console.error('Error: User ID is required');
      console.error('Usage: tsx scripts/generate-auth-credentials.ts jwt-token <userId> [permissions]');
      process.exit(1);
    }
    const permissionsArg = args[2];
    const permissions = permissionsArg ? permissionsArg.split(',') : undefined;
    generateJwtToken(userId, permissions);
    break;
  }

  case 'help':
  case '--help':
  case '-h':
    showUsage();
    break;

  default:
    if (command) {
      console.error(`Error: Unknown command "${command}"`);
    }
    showUsage();
    process.exit(1);
}
