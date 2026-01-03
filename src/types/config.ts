export interface ProviderConfig {
  type: 'ollama' | 'lmstudio' | 'openrouter';
  base_url: string;
  model: string;
  api_key?: string;
  context_window?: number;
}

export interface SystemPromptConfig {
  base_prompt: string;
  task_prefix?: string;
  constraints?: string[];
  output_format?: string;
}

export interface ServerConfig {
  deployment_mode: 'workstation' | 'team';
  max_concurrent_requests: number;
  context_window: {
    min: number;
    max: number;
  };
  default_quality_threshold: number;
  default_max_iterations: number;
  task_timeout_minutes: number;
  retry_ceiling_minutes: number;
  endpoints: {
    alpha: ProviderConfig;
    beta: ProviderConfig;
  };
  system_prompts: {
    alpha: SystemPromptConfig;
    beta: SystemPromptConfig;
  };
  policies_path: string;
  rag_resources_path?: string;
  log_path: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}