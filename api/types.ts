export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIService {
    name: string;
    chat: (messages: ChatMessage[]) => Promise<AsyncIterable<string>>;
}

export class AIServiceError extends Error {
    service: string;
    status?: number;
    details?: unknown;

    constructor(
        service: string,
        message: string,
        options?: { status?: number; details?: unknown; cause?: unknown },
    ) {
        super(message, { cause: options?.cause });
        this.service = service;
        this.status = options?.status;
        this.details = options?.details;
    }
}

export type ChatChoiceDelta = {
    content?: string;
};

export type ChatStreamChoice = {
    delta?: ChatChoiceDelta;
};

export type ChatCompletionStreamChunk = {
    choices?: ChatStreamChoice[];
};