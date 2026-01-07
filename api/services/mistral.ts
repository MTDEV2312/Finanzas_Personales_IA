import { Mistral } from '@mistralai/mistralai';
import type { AIService, ChatMessage } from '../types';

const client = new Mistral();

export const mistralService: AIService = {
    name: 'mistral',
    async chat(messages: ChatMessage[]) {
        const stream = await client.chat.stream({
            model: 'mistral-large-latest',
            messages: messages.map(({ role, content }) => ({ role, content })),
            temperature: 0.7,
            maxTokens: 2048,
            topP: 1,
        });

        return (async function* () {
            for await (const chunk of stream) {
                const content = chunk.data.choices?.[0]?.delta?.content;
                if (typeof content === 'string') {
                    yield content;
                }
            }
        })();
    },
};