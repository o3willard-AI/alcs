import { ProviderConfig } from '../types/config';
import { LLMProvider, ChatCompletionMessage } from '../types/llm';
import { Artifact, ReviewFeedback, TaskSpec } from '../types/mcp';
import { OllamaProvider } from '../providers/ollama';
import { LMStudioProvider } from '../providers/lmstudio';
import { OpenRouterProvider } from '../providers/openrouter';
import { logger } from '../services/loggerService';
import { configManager } from '../services/configService';
import { formatAlphaPrompt } from '../utils/promptFormatter';

export class AgentAlpha {
  private llmProvider: LLMProvider;

  constructor() {
    // Initialize with the configured Alpha provider
    const alphaProviderConfig = configManager.config.endpoints.alpha;
    this.llmProvider = this.createProvider(alphaProviderConfig);
  }

  private createProvider(providerConfig: ProviderConfig): LLMProvider {
    switch (providerConfig.type) {
      case 'ollama':
        return new OllamaProvider(providerConfig);
      case 'lmstudio':
        return new LMStudioProvider(providerConfig);
      case 'openrouter':
        return new OpenRouterProvider(providerConfig);
      default:
        throw new Error(`Unsupported provider type for Agent Alpha: ${providerConfig.type}`);
    }
  }

  public updateProvider(providerConfig: ProviderConfig): void {
    logger.info(`AgentAlpha: Updating LLM provider to ${providerConfig.type} - ${providerConfig.model}`);
    this.llmProvider = this.createProvider(providerConfig);
  }

  /**
   * Generates a code artifact based on a TaskSpec.
   * @param taskSpec The task specification.
   * @returns A promise that resolves to the generated code artifact content.
   */
  public async generate(taskSpec: TaskSpec): Promise<string> {
    const messages = formatAlphaPrompt(taskSpec);
    logger.info(`AgentAlpha: Starting code generation for task: "${taskSpec.description}"`);
    const response = await this.llmProvider.generate(messages);
    return this.parseCode(response.content);
  }


  /**
   * Revises a code artifact based on feedback from Agent Beta.
   * @param artifact The original code artifact to revise.
   * @param feedback The review feedback.
   * @returns A promise that resolves to the revised code artifact content.
   */
  public async revise(artifact: Artifact, feedback: ReviewFeedback): Promise<string> {
    const systemPrompt = this.formatRevisionPrompt(artifact, feedback);
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: artifact.content || '' },
    ];

    logger.info(`AgentAlpha: Starting revision for artifact ${artifact.id}`);
    const response = await this.llmProvider.generate(messages);
    return this.parseCode(response.content);
  }

  private formatRevisionPrompt(artifact: Artifact, feedback: ReviewFeedback): string {
    const alphaPromptConfig = configManager.config.system_prompts.alpha;
    let prompt = alphaPromptConfig.base_prompt;
    prompt += `\n\nYour task is to revise the following code based on the feedback provided by a code reviewer.`;
    prompt += `\nAddress all required changes and consider all suggestions.`;
    prompt += `\n\n## Feedback:\n${JSON.stringify(feedback, null, 2)}`;
    const codeBlock = '\n\n## Original Code to Revise:\n```\n' + artifact.content + '\n```';
    prompt += codeBlock;
    prompt += `\n\nProvide only the complete, revised code in a single markdown block.`;
    return prompt;
  }

  private parseCode(llmResponse: string): string {
    // Find the code block in the response
    const codeBlockMatch = llmResponse.match(/```[a-z]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1];
    }
    // If no code block is found, return the raw response
    return llmResponse;
  }
}
