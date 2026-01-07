import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AIService, ChatMessage } from '../types';

const gemini = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

export const geminiService: AIService = {
    name: 'gemini',
    async chat(messages: ChatMessage[]) {
        const contents = messages.map(({ role, content }) => ({
            role,
            parts: [{ text: content }],
        }));

        const stream = await gemini.models.generateContentStream({
            model: 'gemini-3-flash-preview',
            contents,
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            },
        });

        return (async function* () {
            for await (const chunk of stream as AsyncIterable<{ text?: string }>) {
                if (typeof chunk.text === 'string') {
                    yield chunk.text;
                }
            }
        })();
    },
};
