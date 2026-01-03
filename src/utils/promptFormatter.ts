import { TaskSpec, CodeExample } from '../types/mcp';
import { ChatCompletionMessage } from '../types/llm';

/**
 * Formats a TaskSpec into a set of chat messages suitable for Agent Alpha.
 * This includes a system message providing the overall task, constraints, and examples.
 */
export function formatAlphaPrompt(taskSpec: TaskSpec, existingMessages: ChatCompletionMessage[] = []): ChatCompletionMessage[] {
  const parts: string[] = [];

  parts.push(`You are Agent Alpha, an expert software engineer. Your task is to generate high-quality code based on the provided specifications.`);

  // Add the main task description
  parts.push(`\n\n## Task Description:\n${taskSpec.description}`);

  // Add the target language
  parts.push(`\n\n## Language:\n${taskSpec.language}`);

  // Add constraints if provided
  if (taskSpec.constraints && taskSpec.constraints.length > 0) {
    parts.push(`\n\n## Constraints:`);
    taskSpec.constraints.forEach(constraint => {
      parts.push(`\n- ${constraint}`);
    });
  }

  // Add examples if provided
  if (taskSpec.examples && taskSpec.examples.length > 0) {
    parts.push(`\n\n## Examples:`);
    taskSpec.examples.forEach((example: CodeExample) => {
      // Build the code block string separately using simple concatenation to avoid nested template literal issues.
      const codeBlock = '```' + example.language + '\n' + example.code + '\n' + '```';
      parts.push(`\n### ${example.description} (${example.language})\n${codeBlock}`);
    });
  }

  // Final instruction for Alpha
  parts.push(`\n\nGenerate the code required to fulfill this task. Focus on clean, efficient, and well-tested solutions. Provide only the code in a single markdown block without any additional conversational text.`);

  const systemMessage: ChatCompletionMessage = {
    role: 'system',
    content: parts.join(''),
  };

  // Prepend the system message to any existing messages
  return [systemMessage, ...existingMessages];
}
