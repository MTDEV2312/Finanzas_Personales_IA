import { OpenRouter } from '@openrouter/sdk';
import { AIServiceError, type AIService, type ChatMessage } from '../types';

const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 20000);

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    );
    return Promise.race([promise, timeout]);
};

const openrouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

export const openRouterService: AIService = {
    name: 'openrouter',
    async chat(messages: ChatMessage[]) {
        try {
            const stream = await withTimeout(
                openrouter.chat.send({
                    model: 'xiaomi/mimo-v2-flash:free',
                    messages: messages.map(({ role, content }) => ({ role, content })),
                    stream: true,
                    streamOptions: { includeUsage: true },
                }),
                UPSTREAM_TIMEOUT_MS,
                'openrouter.chat.send',
            );

            return (async function* () {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices?.[0]?.delta?.content;
                        if (typeof content === 'string') {
                            yield content;
                        }
                    }
                } catch (err) {
                    throw new AIServiceError('openrouter', 'Streaming from OpenRouter failed', {
                        cause: err,
                        status: 502,
                    });
                }
            })();
        } catch (error) {
            const isChatError = error instanceof Error && error.name === 'ChatError';
            if (isChatError) {
                // Surface upstream 429/5xx rate limits clearly to the caller
                const errAny = error as { data$?: { error?: { code?: number } } };
                const status = errAny?.data$?.error?.code ?? 502;
                throw new AIServiceError('openrouter', error.message || 'OpenRouter rejected the request', {
                    status,
                    details: errAny?.data$?.error,
                    cause: error,
                });
            }

            const isTimeout = error instanceof Error && error.message.includes('timed out');
            throw new AIServiceError('openrouter', isTimeout ? 'OpenRouter timed out' : 'OpenRouter request failed', {
                status: isTimeout ? 504 : 502,
                cause: error,
            });
        }
    },
};
