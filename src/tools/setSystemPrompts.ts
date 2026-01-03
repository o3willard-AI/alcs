import { AgentType, SetSystemPromptsParams, SetSystemPromptsResponse } from '../types/mcp';
import { configManager } from '../services/configService';
import { logger } from '../services/loggerService';

/**
 * Updates the system prompts for a specific agent (Alpha or Beta).
 */
export async function set_system_prompts(params: SetSystemPromptsParams): Promise<SetSystemPromptsResponse> {
  const { agent, prompts } = params;

  // Basic validation
  if (!prompts || !prompts.base_prompt || typeof prompts.base_prompt !== 'string' || prompts.base_prompt.trim() === '') {
    const message = 'Invalid prompts object: `base_prompt` is required and cannot be empty.';
    logger.warn(`set_system_prompts: ${message}`);
    return {
      success: false,
      message,
    };
  }

  try {
    const previous_prompts = configManager.updateSystemPrompts(agent, prompts);
    logger.info(`set_system_prompts: System prompts for agent '${agent}' have been updated.`);
    return {
      success: true,
      previous_prompts,
    };
  } catch (error: any) {
    const message = `Failed to update system prompts for agent '${agent}'. Error: ${error.message}`;
    logger.error(`set_system_prompts: ${message}`);
    return {
      success: false,
      message,
    };
  }
}
