import { AgentType, ConfigureEndpointParams, ConfigureEndpointResponse, HealthCheckResult } from '../types/mcp';
import { ProviderConfig } from '../types/config';
import { configManager } from '../services/configService';
import { logger } from '../services/loggerService';
import { OllamaProvider } from '../providers/ollama';
import { LMStudioProvider } from '../providers/lmstudio';
import { OpenRouterProvider } from '../providers/openrouter';
import { LLMProvider, ChatCompletionMessage } from '../types/llm';

// Helper function to validate provider configuration
function validateProviderConfig(providerConfig: ProviderConfig): boolean {
  if (!providerConfig.type || !providerConfig.model || !providerConfig.base_url) {
    logger.error(`Invalid provider config: Missing type, model, or base_url. Config: ${JSON.stringify(providerConfig)}`);
    return false;
  }
  if (providerConfig.type === 'openrouter' && !providerConfig.api_key) {
    logger.error('Invalid OpenRouter config: api_key is required.');
    return false;
  }
  return true;
}

// Helper function to perform a basic health check on a provider
async function performHealthCheck(provider: LLMProvider): Promise<HealthCheckResult> {
  const dummyMessage: ChatCompletionMessage = {
    role: 'user',
    content: 'Hello, are you there?',
  };
  const startTime = Date.now();
  try {
    // Attempt a very short generation to check connectivity
    await provider.generate([dummyMessage], { max_tokens: 1, temperature: 0.1 });
    const responseTimeMs = Date.now() - startTime;
    logger.info(`Health check for ${provider.name} successful. Response time: ${responseTimeMs}ms`);
    return { status: 'ok', responseTimeMs };
  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime;
    logger.warn(`Health check for ${provider.name} failed. Error: ${error.message}. Response time: ${responseTimeMs}ms`);
    return { status: 'unreachable', message: error.message, responseTimeMs };
  }
}

/**
 * Configures the LLM endpoint for a specific agent (Alpha or Beta).
 * This allows runtime swapping of LLM providers and models.
 */
export async function configure_endpoint(params: ConfigureEndpointParams): Promise<ConfigureEndpointResponse> {
  const { agent, provider: newProviderConfig } = params;
  const currentConfig = configManager.config;
  const previousConfig = { ...currentConfig.endpoints[agent] }; // Clone for response

  // 1. Validate incoming provider configuration
  if (!validateProviderConfig(newProviderConfig)) {
    return {
      success: false,
      health_check: { status: 'degraded', message: 'Invalid new provider configuration provided.' },
      previous_config: previousConfig,
    };
  }

  // 2. Instantiate the new provider for a health check
  let newProviderInstance: LLMProvider;
  try {
    switch (newProviderConfig.type) {
      case 'ollama':
        newProviderInstance = new OllamaProvider(newProviderConfig);
        break;
      case 'lmstudio':
        newProviderInstance = new LMStudioProvider(newProviderConfig);
        break;
      case 'openrouter':
        newProviderInstance = new OpenRouterProvider(newProviderConfig);
        break;
      default:
        const errorMessage = `Unsupported provider type: ${newProviderConfig.type}`;
        logger.error(`configure_endpoint: ${errorMessage}`);
        return {
          success: false,
          health_check: { status: 'degraded', message: errorMessage },
          previous_config: previousConfig,
        };
    }
  } catch (error: any) {
    logger.error(`configure_endpoint: Failed to instantiate new provider ${newProviderConfig.type}. Error: ${error.message}`);
    return {
      success: false,
      health_check: { status: 'degraded', message: `Failed to instantiate provider: ${error.message}` },
      previous_config: previousConfig,
    };
  }

  // 3. Perform health check
  logger.info(`configure_endpoint: Performing health check on new ${agent} endpoint (${newProviderConfig.type} - ${newProviderConfig.model})...`);
  const healthCheckResult = await performHealthCheck(newProviderInstance);

  if (healthCheckResult.status === 'ok') {
    // 4. Update the configuration manager if health check passes
    configManager.updateProviderConfig(agent, newProviderConfig);
    logger.info(`configure_endpoint: Successfully configured ${agent} endpoint.`);
    return {
      success: true,
      health_check: healthCheckResult,
      previous_config: previousConfig,
    };
  } else {
    logger.warn(`configure_endpoint: Health check failed for new ${agent} endpoint. Configuration not updated.`);
    return {
      success: false,
      health_check: healthCheckResult,
      previous_config: previousConfig,
    };
  }
}
