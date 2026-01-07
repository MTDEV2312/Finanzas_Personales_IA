import { OpenAI } from 'openai';
import { AIServiceError, type AIService, type ChatMessage } from '../types';

const client = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.HF_TOKEN,
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 20000),
});

const makeStream = async (model: string, messages: ChatMessage[], serviceName: string) => {
    try {
        const stream = await client.chat.completions.create({
            model,
            messages: messages.map(({ role, content }) => ({ role, content })),
            stream: true,
        });

        return (async function* () {
            try {
                for await (const chunk of stream) {
                    const content = chunk.choices?.[0]?.delta?.content;
                    if (typeof content === 'string') {
                        yield content;
                    }
                }
            } catch (err) {
                throw new AIServiceError(serviceName, 'Streaming from HuggingFace model failed', {
                    cause: err,
                    status: 502,
                });
            }
        })();
    } catch (error) {
        const isTimeout = error instanceof Error && /Timeout/i.test(error.message);
        throw new AIServiceError(serviceName, isTimeout ? 'Upstream timed out' : 'Upstream request failed', {
            status: isTimeout ? 504 : 502,
            cause: error,
        });
    }
};


export const miniMaxService: AIService = {
    name: 'minimax',
    async chat(messages: ChatMessage[]) {
        return makeStream('MiniMaxAI/MiniMax-M2.1:novita', messages, 'minimax');
    },
};

export const qwenService: AIService = {
    name: 'qwen',
    async chat(messages: ChatMessage[]) {
        return makeStream('Qwen/Qwen3-4B-Instruct-2507:nscale', messages, 'qwen');
    },
};
