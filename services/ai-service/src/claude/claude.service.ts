import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class ClaudeService {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor() {
    const apiKey = process.env.CLAUDE_API_KEY;
    const baseURL = process.env.CLAUDE_API_BASE_URL;

    if (!apiKey) {
      console.warn('⚠️  CLAUDE_API_KEY not set. AI features will not work.');
      console.warn('📝 Add your Claude API key to .env file');
    }

    const config: any = {
      apiKey: apiKey || 'dummy-key-for-development',
    };

    if (baseURL) {
      config.baseURL = baseURL;
      console.log(`🌐 Using custom Claude API endpoint: ${baseURL}`);
    }

    this.client = new Anthropic(config);
  }

  async sendMessage(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    maxTokens: number = 4096
  ) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt || 'You are a helpful AI coding assistant helping users build applications in a sandbox environment.',
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      });

      const content = response.content[0];
      const textContent = content.type === 'text' ? content.text : '';

      return {
        content: textContent,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      console.error('Claude API Error:', error.message);
      throw new Error(`Claude API Error: ${error.message}`);
    }
  }

  async streamMessage(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    onChunk?: (text: string) => void,
    maxTokens: number = 4096
  ) {
    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt || 'You are a helpful AI coding assistant.',
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        stream: true,
      });

      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            fullContent += delta.text;
            if (onChunk) {
              onChunk(delta.text);
            }
          }
        } else if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
        }
      }

      return {
        content: fullContent,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      };
    } catch (error) {
      console.error('Claude Streaming Error:', error.message);
      throw new Error(`Claude Streaming Error: ${error.message}`);
    }
  }

  isConfigured(): boolean {
    return !!process.env.CLAUDE_API_KEY;
  }
}
