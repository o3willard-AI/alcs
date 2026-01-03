import { ProviderConfig } from '../types/config';
import { LLMProvider, ChatCompletionMessage } from '../types/llm';
import { ReviewFeedback, Defect, Artifact, TestFramework } from '../types/mcp';
import { OllamaProvider } from '../providers/ollama';
import { LMStudioProvider } from '../providers/lmstudio';
import { OpenRouterProvider } from '../providers/openrouter';
import { logger } from '../services/loggerService';
import { configManager } from '../services/configService';

export class AgentBeta {
  private llmProvider: LLMProvider;

  constructor() {
    // Initialize with the configured Beta provider
    const betaProviderConfig = configManager.config.endpoints.beta;
    this.llmProvider = this.createProvider(betaProviderConfig);
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
        throw new Error(`Unsupported provider type for Agent Beta: ${providerConfig.type}`);
    }
  }

  public updateProvider(providerConfig: ProviderConfig): void {
    logger.info(`AgentBeta: Updating LLM provider to ${providerConfig.type} - ${providerConfig.model}`);
    this.llmProvider = this.createProvider(providerConfig);
  }

  /**
   * Reviews a code artifact from Agent Alpha.
   * @param artifact The code artifact to be reviewed.
   * @returns A promise that resolves to a ReviewFeedback object.
   */
  public async reviewArtifact(artifact: Artifact): Promise<ReviewFeedback> {
    const systemPrompt = this.formatReviewPrompt(artifact);
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: artifact.content || '' },
    ];

    logger.info(`AgentBeta: Starting review for artifact ${artifact.id}`);
    const response = await this.llmProvider.generate(messages, {
      temperature: 0.2, // Low temperature for more deterministic reviews
    });

    return this.parseReview(response.content);
  }

  private formatReviewPrompt(artifact: Artifact): string {
    const betaPromptConfig = configManager.config.system_prompts.beta;
    let prompt = betaPromptConfig.base_prompt;
    prompt += `\n\nYour task is to review the following code artifact for quality, correctness, and adherence to policies.`;
    prompt += `\nProvide your feedback in a JSON object with the following structure: { "quality_score": number (0-100), "defects": [{ "severity": "critical|major|minor|info", "category": string, "location": string, "description": string, "suggested_fix": string }], "suggestions": [string], "required_changes": [string] }.`;
    prompt += `\nThe quality score should reflect the overall code quality. Defects should be specific and actionable. Suggestions are for non-critical improvements. Required changes are mandatory fixes.`;
    const codeBlock = '\n\n## Code to Review:\n```\n' + artifact.content + '\n```';
    prompt += codeBlock;
    return prompt;
  }

  private parseReview(llmResponse: string): ReviewFeedback {
    try {
      // Find the JSON block in the response
      const jsonMatch = llmResponse.match(/```json\n([\s\S]*?)\n```|({[\s\S]*})/);
      if (!jsonMatch) {
        throw new Error('No JSON block found in the LLM response.');
      }
      const jsonString = jsonMatch[1] || jsonMatch[2]; // Use whichever group matched
      const parsed = JSON.parse(jsonString);

      // Basic validation of the parsed structure
      if (typeof parsed.quality_score !== 'number' || !Array.isArray(parsed.defects)) {
        throw new Error('Parsed JSON is missing required fields `quality_score` or `defects`.');
      }

      logger.info(`AgentBeta: Successfully parsed review. Quality Score: ${parsed.quality_score}`);
      return parsed as ReviewFeedback;
    } catch (error: any) {
      logger.error(`AgentBeta: Failed to parse review from LLM response. Error: ${error.message}. Response: ${llmResponse}`);
      // Return a "failed review" object with the specific error message
      return {
        quality_score: 0,
        defects: [
          {
            severity: 'critical',
            category: 'Parsing Error',
            location: 'N/A',
            description: error.message, // Use the actual error message from the catch block
            suggested_fix: 'Check the raw LLM response for formatting issues.',
          },
        ],
        suggestions: [],
        required_changes: ['Review parsing failed. Manual intervention may be required.'],
      };
    }
  }

  /**
   * Generates a test suite for a given code artifact.
   * @param artifact The code artifact to generate tests for.
   * @param framework The testing framework to use.
   * @param coverageTarget The desired test coverage.
   * @returns A promise that resolves to the generated test code.
   */
  public async generateTestSuite(artifact: Artifact, framework: TestFramework, coverageTarget: number = 80): Promise<string> {
    const systemPrompt = this.formatTestSuitePrompt(artifact, framework, coverageTarget);
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: artifact.content || '' },
    ];

    logger.info(`AgentBeta: Starting test suite generation for artifact ${artifact.id}`);
    const response = await this.llmProvider.generate(messages, {
      temperature: 0.4, // Higher temperature for more creative tests
    });

    return this.parseTestCode(response.content);
  }

  private formatTestSuitePrompt(artifact: Artifact, framework: TestFramework, coverageTarget: number): string {
    const betaPromptConfig = configManager.config.system_prompts.beta;
    let prompt = betaPromptConfig.base_prompt;
    prompt += `\n\nYour task is to generate a comprehensive test suite for the following code artifact.`;
    prompt += `\nUse the "${framework}" testing framework.`;
    prompt += `\nAim for at least ${coverageTarget}% test coverage.`;
    prompt += `\nProvide only the test code in a single markdown block, ready to be saved to a file.`;
    const codeBlock = '\n\n## Code to Test:\n```\n' + artifact.content + '\n```';
    prompt += codeBlock;
    return prompt;
  }

  private parseTestCode(llmResponse: string): string {
    // Find the code block in the response
    const codeBlockMatch = llmResponse.match(/```[a-z]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1];
    }
    // If no code block is found, return the raw response
    return llmResponse;
  }
}