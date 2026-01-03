/**
 * Health Check Tool
 *
 * Returns server health status including endpoint connectivity
 */

import { logger } from '../services/loggerService.js';
import { configManager } from '../services/configService.js';
import { metricsService } from '../services/metricsService.js';
import axios from 'axios';

/**
 * Check health of LLM endpoint
 */
async function checkEndpointHealth(
  endpointType: 'alpha' | 'beta'
): Promise<{ healthy: boolean; latency_ms?: number; error?: string }> {
  try {
    const config = configManager.config.endpoints[endpointType];
    const startTime = Date.now();

    // Try to ping the endpoint
    const response = await axios.get(`${config.base_url}/api/tags`, {
      timeout: 5000,
      validateStatus: () => true, // Accept any status
    });

    const latency = Date.now() - startTime;

    if (response.status === 200) {
      return { healthy: true, latency_ms: latency };
    } else {
      return {
        healthy: false,
        latency_ms: latency,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Health Check Tool Implementation
 */
export async function health_check(): Promise<{
  status: string;
  server_version: string;
  endpoints: {
    alpha: { healthy: boolean; latency_ms?: number; error?: string };
    beta: { healthy: boolean; latency_ms?: number; error?: string };
  };
  uptime_seconds: number;
}> {
  logger.info('Executing health_check');

  const startTime = process.uptime();

  // Check both agent endpoints
  const [alphaHealth, betaHealth] = await Promise.all([
    checkEndpointHealth('alpha'),
    checkEndpointHealth('beta'),
  ]);

  // Update LLM endpoint status metrics
  const alphaProvider = configManager.config.endpoints.alpha.type || 'unknown';
  const betaProvider = configManager.config.endpoints.beta.type || 'unknown';
  metricsService.setLLMEndpointStatus(alphaProvider, alphaHealth.healthy);
  metricsService.setLLMEndpointStatus(betaProvider, betaHealth.healthy);

  const overallHealthy = alphaHealth.healthy && betaHealth.healthy;

  const result = {
    status: overallHealthy ? 'healthy' : 'degraded',
    server_version: '1.0.0',
    endpoints: {
      alpha: alphaHealth,
      beta: betaHealth,
    },
    uptime_seconds: Math.floor(startTime),
  };

  logger.info(
    `Health check complete: ${result.status} (alpha: ${alphaHealth.healthy}, beta: ${betaHealth.healthy})`
  );

  return result;
}
