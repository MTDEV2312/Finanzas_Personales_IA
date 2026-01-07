import Cerebras from '@cerebras/cerebras_cloud_sdk';
import type {
    AIService,
    ChatCompletionStreamChunk,
    ChatMessage,
} from '../types';

const cerebras = new Cerebras();

export const cerebrasService: AIService = {
    name: 'cerebras',
    async chat(messages: ChatMessage[]) {
        const stream = await cerebras.chat.completions.create({
            messages: messages.map(({ role, content }) => ({ role, content })),
            model: 'gpt-oss-120b',
            stream: true,
            max_completion_tokens: 32768,
            temperature: 1,
            top_p: 1,
            reasoning_effort: 'medium',
        });

        return (async function* () {
            for await (const chunk of stream as AsyncIterable<ChatCompletionStreamChunk>) {
                const content = chunk.choices?.[0]?.delta?.content;
                if (typeof content === 'string') {
                    yield content;
                }
            }
        })();
    },
};

