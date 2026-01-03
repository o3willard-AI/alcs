import { formatAlphaPrompt } from '../../src/utils/promptFormatter';
import { TaskSpec, CodeExample } from '../../src/types/mcp';
import { ChatCompletionMessage } from '../../src/types/llm';

describe('formatAlphaPrompt', () => {
  it('should format a minimal TaskSpec into a system message', () => {
    const taskSpec: TaskSpec = {
      description: 'Implement a simple calculator function.',
      language: 'JavaScript',
    };

    const formattedMessages = formatAlphaPrompt(taskSpec);

    expect(formattedMessages).toHaveLength(1);
    expect(formattedMessages[0].role).toBe('system');
    expect(formattedMessages[0].content).toContain('You are Agent Alpha, an expert software engineer.');
    expect(formattedMessages[0].content).toContain('## Task Description:\nImplement a simple calculator function.');
    expect(formattedMessages[0].content).toContain('## Language:\nJavaScript');
    expect(formattedMessages[0].content).not.toContain('## Constraints:');
    expect(formattedMessages[0].content).not.toContain('## Examples:');
    expect(formattedMessages[0].content).toContain('Provide only the code in a single markdown block');
  });

  it('should include constraints when provided in TaskSpec', () => {
    const taskSpec: TaskSpec = {
      description: 'Implement a user authentication module.',
      language: 'Python',
      constraints: [
        'Use Flask framework.',
        'Encrypt passwords with bcrypt.',
      ],
    };

    const formattedMessages = formatAlphaPrompt(taskSpec);

    expect(formattedMessages).toHaveLength(1);
    expect(formattedMessages[0].role).toBe('system');
    expect(formattedMessages[0].content).toContain('## Constraints:');
    expect(formattedMessages[0].content).toContain('- Use Flask framework.');
    expect(formattedMessages[0].content).toContain('- Encrypt passwords with bcrypt.');
  });

  it('should include examples when provided in TaskSpec', () => {
    const example1: CodeExample = {
      description: 'Add function',
      code: 'function add(a, b) { return a + b; }',
      language: 'javascript',
    };
    const example2: CodeExample = {
      description: 'Subtract function',
      code: 'def subtract(a, b): return a - b',
      language: 'python',
    };
    const taskSpec: TaskSpec = {
      description: 'Implement basic arithmetic operations.',
      language: 'JavaScript',
      examples: [example1, example2],
    };

    const formattedMessages = formatAlphaPrompt(taskSpec);

    expect(formattedMessages).toHaveLength(1);
    expect(formattedMessages[0].role).toBe('system');
    expect(formattedMessages[0].content).toContain('## Examples:');
    expect(formattedMessages[0].content).toContain('### Add function (javascript)\n```javascript\nfunction add(a, b) { return a + b; }\n```');
    expect(formattedMessages[0].content).toContain('### Subtract function (python)\n```python\ndef subtract(a, b): return a - b\n```');
  });

  it('should prepend the system message to existing messages', () => {
    const taskSpec: TaskSpec = {
      description: 'Solve problem X.',
      language: 'Rust',
    };
    const existingMessages: ChatCompletionMessage[] = [
      { role: 'user', content: 'Here is some previous context.' },
      { role: 'assistant', content: 'Acknowledged.' },
    ];

    const formattedMessages = formatAlphaPrompt(taskSpec, existingMessages);

    expect(formattedMessages).toHaveLength(3);
    expect(formattedMessages[0].role).toBe('system');
    expect(formattedMessages[1].role).toBe('user');
    expect(formattedMessages[1].content).toBe('Here is some previous context.');
    expect(formattedMessages[2].role).toBe('assistant');
    expect(formattedMessages[2].content).toBe('Acknowledged.');
    expect(formattedMessages[0].content).toContain('Solve problem X.');
  });

  it('should handle all optional fields correctly in a comprehensive task spec', () => {
    const taskSpec: TaskSpec = {
      description: 'Develop a microservice with CRUD operations for a "Product" entity.',
      language: 'Go',
      context_files: ['main.go', 'models/product.go'],
      constraints: [
        'Use Gin framework.',
        'Implement proper error handling.',
        'Database interactions via GORM.',
      ],
      examples: [
        {
          description: 'Product struct',
          code: `type Product struct {
  ID uint \`gorm:"primaryKey"\`
  Name string
}`,
          language: 'go',
        },
      ],
    };

    const formattedMessages = formatAlphaPrompt(taskSpec);

    expect(formattedMessages).toHaveLength(1);
    expect(formattedMessages[0].role).toBe('system');
    const content = formattedMessages[0].content;

    expect(content).toContain('## Task Description:\nDevelop a microservice with CRUD operations for a "Product" entity.');
    expect(content).toContain('## Language:\nGo');
    expect(content).toContain('## Constraints:\n- Use Gin framework.\n- Implement proper error handling.\n- Database interactions via GORM.');
    expect(content).toContain(`## Examples:
### Product struct (go)
\`\`\`go
type Product struct {
  ID uint \`gorm:"primaryKey"\`
  Name string
}
\`\`\``);
    expect(content).toContain('Provide only the code in a single markdown block');
  });

  it('should not modify the original existingMessages array', () => {
    const taskSpec: TaskSpec = {
      description: 'Test immutability.',
      language: 'JavaScript',
    };
    const existingMessages: ChatCompletionMessage[] = [
      { role: 'user', content: 'Original message.' },
    ];

    const formattedMessages = formatAlphaPrompt(taskSpec, existingMessages);

    expect(formattedMessages).not.toBe(existingMessages); // Should be a new array
    expect(existingMessages).toEqual([{ role: 'user', content: 'Original message.' }]); // Original should be unchanged
  });
});