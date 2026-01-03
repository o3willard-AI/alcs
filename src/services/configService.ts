import fs from 'fs';
import path from 'path';
import { ServerConfig, ProviderConfig } from '../types/config';
import { logger } from '../services/loggerService';
import { AgentType, SystemPromptConfig } from '../types/mcp'; // Import AgentType and SystemPromptConfig

// Default configuration to be used if config.json is not found or is invalid
const DEFAULT_SERVER_CONFIG: ServerConfig = {
  deployment_mode: 'workstation',
  max_concurrent_requests: 5,
  context_window: {
    min: 32000,
    max: 256000,
  },
  default_quality_threshold: 85,
  default_max_iterations: 5,
  task_timeout_minutes: 30,
  retry_ceiling_minutes: 10,
  endpoints: {
    alpha: {
      type: 'ollama',
      base_url: 'http://localhost:11434',
      model: 'llama3',
    },
    beta: {
      type: 'ollama',
      base_url: 'http://localhost:11434',
      model: 'llama3:70b',
    },
  },
  policies_path: './policies',
  rag_resources_path: undefined, // Add default for optional field
  log_path: './logs/alcs.log',
  log_level: 'info',
  // Add default system prompts
  system_prompts: {
    alpha: {
      base_prompt: 'You are Agent Alpha, an expert software engineer. Your task is to generate high-quality code based on the provided specifications.',
    },
    beta: {
      base_prompt: 'You are Agent Beta, an expert code reviewer. Your task is to review the provided code for quality, correctness, and adherence to policies.',
    },
  },
};


class ConfigManager {
  private static instance: ConfigManager;
  private _config: ServerConfig; // Make it private and mutable internally

  private constructor() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    let parsedConfig: Partial<ServerConfig>;

    if (fs.existsSync(configPath)) {
      try {
        const rawConfig = fs.readFileSync(configPath, 'utf-8');
        parsedConfig = JSON.parse(rawConfig);
        // Validate parsedConfig for essential properties before merging
        this.validateConfig(parsedConfig);
        // Deep merge with defaults to ensure all properties exist
        this._config = {
          ...DEFAULT_SERVER_CONFIG,
          ...parsedConfig,
          endpoints: { ...DEFAULT_SERVER_CONFIG.endpoints, ...parsedConfig.endpoints },
          system_prompts: { ...DEFAULT_SERVER_CONFIG.system_prompts, ...parsedConfig.system_prompts },
        };
      } catch (error: any) {
        if (error.message.startsWith('Invalid configuration')) {
          throw error;
        }
        logger.error(`Failed to read or parse config.json at ${configPath}. Error: ${error.message}`);
        this._config = DEFAULT_SERVER_CONFIG;
      }
    } else {
      logger.warn(`config.json not found at ${configPath}. Using default configuration.`);
      this._config = DEFAULT_SERVER_CONFIG;
    }
  }

  private validateConfig(config: Partial<ServerConfig>): void {
    if (!config.endpoints || !config.endpoints.alpha || !config.endpoints.beta) {
      throw new Error('Invalid configuration: Alpha and Beta endpoints must be defined.');
    }
    if (!config.system_prompts || !config.system_prompts.alpha || !config.system_prompts.beta) {
      throw new Error('Invalid configuration: Alpha and Beta system prompts must be defined.');
    }
    // Add more validation logic here as needed
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  // Getter for the current configuration
  public get config(): Readonly<ServerConfig> {
    return this._config; // Return a readonly view of the config
  }

  /**
   * Updates the provider configuration for a specific agent (alpha or beta).
   * @param agentType The agent type ('alpha' or 'beta').
   * @param newProviderConfig The new provider configuration.
   * @returns The previous provider configuration.
   */
  public updateProviderConfig(agentType: AgentType, newProviderConfig: ProviderConfig): ProviderConfig {
    const previousConfig = { ...this._config.endpoints[agentType] }; // Clone previous config

    // Update the internal mutable config
    this._config = {
      ...this._config,
      endpoints: {
        ...this._config.endpoints,
        [agentType]: newProviderConfig,
      },
    };
    logger.info(`Updated provider config for ${agentType} agent to model: ${newProviderConfig.model}`);
    return previousConfig;
  }

  /**
   * Updates the system prompts for a specific agent (alpha or beta).
   * @param agentType The agent type ('alpha' or 'beta').
   * @param newPrompts The new system prompt configuration.
   * @returns The previous system prompt configuration.
   */
  public updateSystemPrompts(agentType: AgentType, newPrompts: SystemPromptConfig): SystemPromptConfig {
    const previousPrompts = { ...this._config.system_prompts[agentType] }; // Clone previous prompts

    this._config = {
      ...this._config,
      system_prompts: {
        ...this._config.system_prompts,
        [agentType]: newPrompts,
      },
    };
    logger.info(`Updated system prompts for ${agentType} agent.`);
    return previousPrompts;
  }


  /**
   * Updates specific properties of the main server configuration.
   * Note: This is a shallow merge. For deep merges, more complex logic is needed.
   * @param newConfig Partial new configuration to apply.
   * @returns The previous full configuration before update.
   */
  public updateServerConfig(newConfig: Partial<ServerConfig>): ServerConfig {
    const previousConfig = { ...this._config }; // Clone previous full config
    this._config = { ...this._config, ...newConfig };
    this.validateConfig(this._config); // Re-validate after update
    logger.info('Server configuration updated.');
    return previousConfig;
  }
}

export const configManager = ConfigManager.getInstance();
