import { Groq } from 'groq-sdk';
import type { AIService, ChatMessage } from '../types';

let groq: Groq | undefined;

export const groqService: AIService = {
  name: 'groq',
  async chat(messages: ChatMessage[]) {
    groq ??= new Groq();
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: "openai/gpt-oss-120b",
      temperature: 0.1,
      max_completion_tokens: 256,
      top_p: 1,
      stream: true,
      response_format: { type: "json_object" },
      stop: null
    });
    return (async function* () {
      for await (const chunk of chatCompletion) {
        yield chunk.choices[0]?.delta?.content || '';
      }
    })();
  }
};
