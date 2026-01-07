# Asistente de Finanzas por Voz con Alexa, n8n y AI

Este proyecto es un sistema completo de registro de gastos controlado por voz. Permite al usuario dictar sus gastos a un dispositivo Alexa, procesar el lenguaje natural con IA para estructurar los datos y guardarlos automáticamente en Google Sheets.

## Arquitectura del Sistema

**Voz (Alexa) ➡️ Webhook (n8n) ➡️ IA (API Procesamiento) ➡️ Base de Datos (Google Sheets)**

1. **Alexa Skill:** Captura el input del usuario ("Compré una hamburguesa de 12 dólares").
2. **n8n Workflow:** Orquesta la comunicación. Recibe el texto, lo envía a la API de IA y maneja la respuesta.
3. **API Personalizada:** Limpia y estructura el texto desordenado en un formato JSON estandarizado (`monto`, `categoria`, `concepto`).
4. **Google Sheets:** Actúa como base de datos persistente.

## Estructura del Repositorio

* `/api`: Código fuente de la API de procesamiento de texto (Node).
* `/n8n`: Archivo JSON importable con el flujo de trabajo completo de automatización.
* `/alexaSkill`: Modelo de interacción (Intents, Slots) listo para importar en Alexa Developer Console.

## Instalación y Uso

### Prerrequisitos
- Bun: este proyecto usa Bun para ejecutar la API.
- Windows: instala Bun con PowerShell:

```powershell
iwr bun.sh/install.ps1 -UseBasicParsing | iex
# Verifica la instalación
bun --version
```

### 1. Backend (API)
Instalar dependencias y ejecutar:
```bash
cd api
bun install
bun run dev
```

### 2. n8n
1. Instalar n8n.
2. Importar el archivo `/n8n/finanzas_workflow.json`.
3. Configurar las credenciales de Google Sheets.

> Importante: El archivo JSON exportado de n8n no incluye credenciales ni variables sensibles. Tras importar el flujo, configura en n8n las credenciales y variables necesarias (según tu caso):
- Credenciales de Google (Service Account u OAuth) y/o `Spreadsheet ID`.
- URL/Secret del Webhook (si usas autenticación en el webhook).
- Cualquier otro valor sensible (tokens, IDs, URLs) referenciado por nodos del flujo.

### 3. Alexa
1. Crear una nueva Skill en Amazon Developer Console.
2. Ir a "JSON Editor" y pegar el contenido de `/alexaSkill/interaction_model.json`.
3. Apuntar el Endpoint al Webhook de n8n.

## Tecnologías Usadas
* Amazon Alexa Skills Kit
* n8n (Workflow Automation)
* Bun (runtime y gestor de paquetes)
* Node.js
* Google Sheets API