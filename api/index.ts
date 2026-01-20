import { cerebrasService } from "./services/cerebras";
import { geminiService } from "./services/gemini";
import { groqService } from "./services/groq";
import {miniMaxService, qwenService } from "./services/huggingface";
import { mistralService } from "./services/mistral";
import { openRouterService } from "./services/openRouter";
import { AIServiceError, type AIService, type ChatMessage } from "./types";

const SYSTEM_PROMPT = `Eres un asistente contable experto especializado en extracción estructurada de gastos a partir de texto en lenguaje natural.

Tu tarea es analizar el texto proporcionado por el usuario y extraer la información del gasto.

Debes identificar y devolver los siguientes campos:
- concepto: una descripción breve y clara del gasto (capitaliza la primera letra).
- monto: número decimal (convierte números escritos en palabras a formato numérico).
- moneda: código de moneda en formato ISO 4217 (por ejemplo: USD, EUR, MXN).  
  - Si no se especifica moneda, asume USD.
- categoria: clasifica el gasto en una de las siguientes categorías EXACTAS:
  [Alimentación, Transporte, Vivienda, Ocio, Salud, Tecnología, Otros]

Reglas importantes:
- Si hay varios gastos en el texto, extrae únicamente el gasto principal.
- Ignora cualquier información que no esté relacionada con un gasto.
- No agregues campos adicionales.
- No incluyas explicaciones, comentarios ni texto fuera del JSON.
- La salida DEBE ser un objeto JSON válido y puro.

Ejemplo de entrada:
"Pagué doce con cincuenta en unas hamburguesas"

Ejemplo de salida:
{
  "concepto": "Hamburguesas",
  "monto": 12.50,
  "moneda": "USD",
  "categoria": "Alimentación"
}`;

const services: AIService[] = [
    groqService,
    cerebrasService,
    geminiService,
    mistralService,
    openRouterService,
    miniMaxService,
    qwenService
]
let currentServiceIndex = 0;

function getNextService(){
    const service= services[currentServiceIndex];
    currentServiceIndex = (currentServiceIndex + 1) % services.length;
    return service;
}
async function getStreamWithFallback(messages: ChatMessage[]) {
    let lastError: unknown;

    // Agregar el prompt del sistema al inicio de los mensajes si no está presente
    const messagesWithSystem: ChatMessage[] = 
        messages[0]?.role === 'system' 
            ? messages 
            : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    for (let attempt = 0; attempt < services.length; attempt++) {
        const service = getNextService();
        try {
            console.log(`Using service: ${service?.name}`);
            const stream = await service?.chat(messagesWithSystem);
            if (stream) {
                return { service, stream };
            }
        } catch (error) {
            lastError = error;
            const status = error instanceof AIServiceError ? error.status ?? 502 : 502;
            console.error(`Service ${service?.name} failed with status ${status}`, error);
        }
    }

    throw lastError ?? new AIServiceError('unknown', 'All services failed');
}

const server = Bun.serve({
    hostname: "0.0.0.0",
    port: process.env.PORT ?? 3000,
    idleTimeout: Number(process.env.IDLE_TIMEOUT_SECONDS ?? 120),
    async fetch(req) {
        const {pathname} = new URL(req.url);

        if (req.method === 'GET' && pathname === '/health') {
            const uptimeSeconds = typeof process !== 'undefined' && typeof process.uptime === 'function'
                ? process.uptime()
                : 0;

            return new Response(JSON.stringify({
                status: 'ok',
                uptime: uptimeSeconds,
                timestamp: new Date().toISOString(),
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (req.method === 'POST' && pathname === '/chat') {
            try {
                const {messages} = await req.json() as {messages: ChatMessage[]};
                if (!Array.isArray(messages) || messages.length === 0) {
                    return new Response(JSON.stringify({ error: 'messages payload is required' }), { status: 400 });
                }

                const { service, stream } = await getStreamWithFallback(messages);

                
                const readableStream = new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const chunk of stream) {
                                controller.enqueue(chunk);
                            }
                            controller.close();
                        } catch (error) {
                            controller.error(error);
                        }
                    }
                });

                return new Response(readableStream,{
                    headers:{
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Backend-Service': service?.name ?? 'unknown',
                    }
                });
            } catch (error) {
                const status = error instanceof AIServiceError && error.status ? error.status : 502;
                const message = error instanceof Error ? error.message : 'Unknown error';
                return new Response(JSON.stringify({ error: message }), {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        return new Response("Not Found", {status: 404});
    }
});

console.info(`Servidor escuchando en ${server.url}`);
