# API Documentation

This document provides an overview of the API endpoints available in the application.

## Connection Information

**Base URL**: `http://localhost:3432` (development) or your deployed domain (production)

All endpoints are relative to the base URL. For example, to call the generate-message endpoint:
```
http://localhost:3432/api/generate-message
```

**NanoGPT API Base URL Override**: Set `NANOGPT_BASE_URL` to route upstream NanoGPT API calls through a proxy or alternate endpoint (default: `https://nano-gpt.com`).

## Authentication

The API supports two methods of authentication:
1. **Session Cookie**: For browser-based authenticated sessions.
2. **API Key**: For external tools and scripts. Use the `Authorization: Bearer <your_api_key>` header.

### Authentication Examples

**Using API Key (Bearer Token)**:
```bash
curl -X POST "http://localhost:3432/api/generate-message" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key_here" \
  -d '{"message": "Hello!", "model_id": "gpt-4"}'
```

**Using Session Cookie**:
```bash
curl -X GET "http://localhost:3432/api/assistants" \
  -b "session_cookie_name=session_cookie_value"
```

---

## Endpoints

### Generation

#### POST `/api/generate-message`
Generates a response from an AI model. This is the core endpoint for chat functionality.

**Authentication**: Session or API Key

Notes:
- If you authenticate with a NanoChat API key (`Authorization: Bearer nc_...`) or a session cookie, the server will use your stored NanoGPT key or the server `NANOGPT_API_KEY`.
- To pass a NanoGPT key directly, send it via `x-api-key` or `Authorization: Bearer <nanogpt_key>` (non-`nc_`).

**Request Body**:
```json
{
  "message": "string (optional if conversation_id exists)",
  "model_id": "string",
  "assistant_id": "string (optional)",
  "project_id": "string (optional)",
  "session_token": "string (optional)",
  "conversation_id": "string (optional)",
  "web_search_enabled": "boolean (optional)",
  "web_search_mode": "enum: 'off' | 'standard' | 'deep' (optional)",
  "web_search_provider": "enum: 'linkup' | 'tavily' | 'exa' | 'kagi' | 'perplexity' | 'valyu' (optional)",
  "web_search_exa_depth": "enum: 'fast' | 'auto' | 'neural' | 'deep' (optional) - Exa provider depth mode",
  "web_search_context_size": "enum: 'low' | 'medium' | 'high' (optional) - Search result context amount",
  "web_search_kagi_source": "enum: 'web' | 'news' | 'search' (optional) - Kagi provider source type",
  "web_search_valyu_search_type": "enum: 'all' | 'web' (optional) - Valyu provider search type (all sources or web only)",
  "images": [
    {
      "url": "string",
      "storage_id": "string",
      "fileName": "string (optional)"
    }
  ],
  "documents": [
    {
      "url": "string",
      "storage_id": "string",
      "fileName": "string (optional)",
      "fileType": "enum: 'pdf' | 'markdown' | 'text' | 'epub'"
    }
  ],
  "image_params": {
    "nImages": "number (optional) - number of images to generate (if supported)",
    "resolution": "string (optional)",
    "quality": "string (optional)",
    "aspect_ratio": "string (optional)",
    "seed": "number (optional, set -1 for random)"
  },
  "reasoning_effort": "enum: 'low' | 'medium' | 'high' (optional)",
  "temporary": "boolean (optional)",
  "provider_id": "string (optional) - Select specific provider for this generation"
}
```

**Response**:
```json
{
  "ok": true,
  "conversation_id": "string"
}
```
Note: This endpoint triggers a background process for generation. The response returns immediately with the conversation ID. The client typically subscribes to changes or polls for the message content (implementation detail: specific mechanism for real-time updates might need further check, e.g., SSE or polling).

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/generate-message" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "message": "What is the capital of France?",
    "model_id": "gpt-4"
  }'
```

#### POST `/api/generate-message/stream`
Generates a response from an AI model with real-time Server-Sent Events (SSE) streaming. Ideal for native apps that want to display tokens as they arrive instead of polling.

**Authentication**: Session or API Key

**Request Body**: Same as `/api/generate-message` (excluding `image_params` since image/video models are not supported for streaming).

**Response**: `text/event-stream` with the following SSE events:

**Event Types**:

1. **`message_start`** - Sent immediately when generation begins
```
event: message_start
data: {"conversation_id":"conv_abc123","message_id":"msg_xyz789"}
```

2. **`delta`** - Sent for each token/chunk received (may be many of these)
```
event: delta
data: {"content":"Hello","reasoning":""}
```

3. **`message_complete`** - Sent when generation finishes successfully
```
event: message_complete
data: {
  "token_count": 123,
  "cost_usd": 0.001,
  "response_time_ms": 1500,
  "time_to_first_token_ms": 320
}
```

4. **`error`** - Sent if an error occurs during generation
```
event: error
data: {"error":"Something went wrong"}
```
On an `error`, the server also persists the error on the assistant message (when available) and resets `conversations.generating` to `false`.

**Notes**:
- Image and video generation models are **not supported** for streaming. Use `/api/generate-message` instead.
- The connection remains open until generation completes or an error occurs.
- Messages are still saved to the database, preserving conversation history.
- Client disconnection is handled gracefully (generation is cancelled).
- Supports all features of the non-streaming endpoint (web search, MCP tools, reasoning models, etc.).

**CURL Example**:
```bash
curl -N -X POST "http://localhost:3432/api/generate-message/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "message": "What is the capital of France?",
    "model_id": "gpt-4"
  }'
```

**iOS/Swift Example**:
```swift
let url = URL(string: "https://your-app.com/api/generate-message/stream")!
var request = URLRequest(url: url)
request.httpMethod = "POST"
request.setValue("Bearer nc_xxx", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.httpBody = try JSONEncoder().encode(["message": "Hello", "model_id": "gpt-4o"])

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    // Process SSE events line by line
}
task.resume()
```

**Android/Kotlin Example**:
```kotlin
val client = OkHttpClient()
val jsonBody = """{"message":"Hello","model_id":"gpt-4o"}""".toRequestBody("application/json".toMediaType())
val request = Request.Builder()
    .url("https://your-app.com/api/generate-message/stream")
    .post(jsonBody)
    .addHeader("Authorization", "Bearer nc_xxx")
    .build()

client.newCall(request).enqueue(object : Callback {
    override fun onResponse(call: Call, response: Response) {
        response.body?.source()?.let { source ->
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                // Parse SSE event lines
            }
        }
    }
    override fun onFailure(call: Call, e: IOException) { /* handle error */ }
})
```

---

### Text-to-Speech

#### POST `/api/tts`
Proxies requests to NanoGPT TTS API for speech synthesis.

**Authentication**: Session or API Key

Notes:
- If you authenticate with a NanoChat API key (`Authorization: Bearer nc_...`) or a session cookie, the server will use your stored NanoGPT key or the server `NANOGPT_API_KEY`.
- To pass a NanoGPT key directly, send it via `x-api-key` or `Authorization: Bearer <nanogpt_key>` (non-`nc_`).

**Request Body**:
```json
{
  "text": "string",
  "model": "string (optional, default: 'tts-1')",
  "voice": "string (optional, default: 'alloy')",
  "speed": "number (optional, default: 1.0)"
}
```

**Response**:
- Content-Type: `audio/mpeg`
- Body: Binary audio data

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/tts" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"text": "Hello, world!", "voice": "alloy"}' \
  --output speech.mp3
```

#### GET `/api/tts/status`
Polls the status of an asynchronous TTS request.

**Authentication**: Session or API Key

Notes:
- If you authenticate with a NanoChat API key (`Authorization: Bearer nc_...`) or a session cookie, the server will use your stored NanoGPT key or the server `NANOGPT_API_KEY`.
- To pass a NanoGPT key directly, send it via `x-api-key` or `Authorization: Bearer <nanogpt_key>` (non-`nc_`).

**Query Parameters**:
- `runId`: (Required) The run ID returned by `/api/tts`.
- `model`: (Required) The TTS model ID.
- `cost`: (Optional) Estimated cost from the submit response.
- `paymentSource`: (Optional) Payment source from the submit response.
- `isApiRequest`: (Optional) Whether the request was an API request.

**Response**:
```json
{
  "status": "pending" | "completed" | "error",
  "audioUrl": "string (when completed)",
  "contentType": "string (optional)",
  "model": "string",
  "error": "string (optional)"
}
```

**CURL Example**:
```bash
curl "http://localhost:3432/api/tts/status?runId=RUN_ID&model=Elevenlabs-Turbo-V2.5" \
  -H "Authorization: Bearer your_api_key"
```

---

### Speech-to-Text

#### POST `/api/stt`
Proxies audio files to NanoGPT STT API for transcription.

**Authentication**: Session or API Key

Notes:
- If you authenticate with a NanoChat API key (`Authorization: Bearer nc_...`) or a session cookie, the server will use your stored NanoGPT key or the server `NANOGPT_API_KEY`.
- To pass a NanoGPT key directly, send it via `x-api-key` or `Authorization: Bearer <nanogpt_key>` (non-`nc_`).

**Request Body** (FormData):
- `audio`: Binary audio file (webm, mp4, etc).
- `model`: "string (optional, default: 'Whisper-Large-V3')"
- `language`: "string (optional, default: 'auto')"

**Response**:
```json
{
  "transcription": "string",
  "text": "string (fallback)",
  "metadata": {
    "cost": 0.01,
    ...
  }
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/stt" \
  -b "session_cookie=your_session" \
  -F "audio=@recording.webm" \
  -F "model=Whisper-Large-V3"
```

---

### Video Generation
 
#### POST `/api/video/generate`
Proxies requests to NanoGPT Video Generation API.
 
**Authentication**: Session
 
**Request Body**:
```json
{
  "model": "string",
  "prompt": "string",
  // Additional parameters depending on the model (e.g., duration, aspect_ratio)
}
```
 
**Response**:
```json
{
  "runId": "string"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/video/generate" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"model": "runway-gen3", "prompt": "A beautiful sunset over the ocean"}'
```
 
#### GET `/api/video/status`
Check the status of a video generation task.
 
**Authentication**: Session
 
**Query Parameters**:
- `runId`: (Required) The run ID returned by the generate endpoint.
- `model`: (Optional) The model ID used for generation.
 
**Response**:
```json
{
  "data": {
    "status": "COMPLETED" | "IN_QUEUE" | "IN_PROGRESS" | "FAILED",
    "output": {
       "video": {
         "url": "string"
       }
    }
  }
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/video/status?runId=abc123&model=runway-gen3" \
  -b "session_cookie=your_session"
```

---

### MCP (Model Context Protocol)

#### GET `/api/mcp`
Check MCP status for the current user.

**Authentication**: Session or API Key

**Response**:
```json
{
  "enabled": "boolean",
  "available": "boolean",
  "reason": "string (only if not available)"
}
```

**Note**: MCP is not available when using the server API key with `SUBSCRIPTION_MODELS_ONLY=true`.

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/mcp" \
  -H "Authorization: Bearer your_api_key"
```

#### POST `/api/mcp`
Execute an MCP tool call.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "tool": "string (required)",
  "args": "object (optional)"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "string",
  "tool": "string",
  "args": "object"
}
```

**Note**: MCP must be enabled in Account Settings and is not available when using the server API key with `SUBSCRIPTION_MODELS_ONLY=true`.

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{"tool": "web_search", "args": {"query": "latest news"}}'
```

---
 
### API Keys

#### GET `/api/api-keys`
List active API keys for the current user.

**Authentication**: Session or API Key

**Response**:
```json
{
  "keys": [
    {
      "id": "string",
      "name": "string",
      "lastUsedAt": "date",
      "createdAt": "date"
    }
  ]
}
```
**Note**: The actual key value is never returned in list responses.

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/api-keys" \
  -b "session_cookie=your_session"
```

#### POST `/api/api-keys`
Create a new API key.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (1-100 chars)"
}
```

**Response**:
```json
{
  "id": "string",
  "key": "string (The actual API key, shown only once)",
  "name": "string",
  "createdAt": "date"
}
```
**Note**: The key is returned only during creation. Save it securely - it cannot be retrieved again. Keys are stored encrypted in the database using AES-256-GCM.

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/api-keys" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"name": "My CLI Tool"}'
```

#### DELETE `/api/api-keys`
Revoke an API key.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "id": "string"
}
```

**Response**:
```json
{
  "success": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/api-keys" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"id": "key_abc123"}'
```

---

### Assistants

#### GET `/api/assistants`
List all assistants for the user. If no assistants exist, a default one is created and returned.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string | null",
    "systemPrompt": "string",
    "isDefault": "boolean",
    "defaultModelId": "string | null",
    "defaultWebSearchMode": "string | null",
    "defaultWebSearchProvider": "string | null",
    "defaultWebSearchExaDepth": "string | null",
    "defaultWebSearchContextSize": "string | null",
    "defaultWebSearchKagiSource": "string | null",
    "defaultWebSearchValyuSearchType": "string | null",
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/assistants" \
  -b "session_cookie=your_session"
```

#### POST `/api/assistants`
Create a new assistant.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (1-100 chars)",
  "systemPrompt": "string (max 10000 chars)",
  "defaultModelId": "string (optional)",
  "defaultWebSearchMode": "enum: 'off' | 'standard' | 'deep' (optional)",
  "defaultWebSearchProvider": "enum: 'linkup' | 'tavily' | 'exa' | 'kagi' | 'perplexity' | 'valyu' (optional)",
  "defaultWebSearchExaDepth": "enum: 'fast' | 'auto' | 'neural' | 'deep' (optional)",
  "defaultWebSearchContextSize": "enum: 'low' | 'medium' | 'high' (optional)",
  "defaultWebSearchKagiSource": "enum: 'web' | 'news' | 'search' (optional)",
  "defaultWebSearchValyuSearchType": "enum: 'all' | 'web' (optional)"
}
```

**Response**:
```json
{
  "id": "string",
  "name": "string",
  "systemPrompt": "string",
  ... // other assistant fields
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/assistants" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"name": "Coding Helper", "systemPrompt": "You are a helpful coding assistant."}'
```

#### PATCH `/api/assistants/[id]`
Update an assistant.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (optional)",
  "systemPrompt": "string (optional)",
  "defaultModelId": "string | null (optional)",
  "defaultWebSearchMode": "enum: 'off' | 'standard' | 'deep' | null (optional)",
  "defaultWebSearchProvider": "enum: 'linkup' | 'tavily' | 'exa' | 'kagi' | 'perplexity' | 'valyu' | null (optional)",
  "defaultWebSearchExaDepth": "enum: 'fast' | 'auto' | 'neural' | 'deep' | null (optional)",
  "defaultWebSearchContextSize": "enum: 'low' | 'medium' | 'high' | null (optional)",
  "defaultWebSearchKagiSource": "enum: 'web' | 'news' | 'search' | null (optional)",
  "defaultWebSearchValyuSearchType": "enum: 'all' | 'web' | null (optional)"
}
```

**CURL Example**:
```bash
curl -X PATCH "http://localhost:3432/api/assistants/asst_abc123" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"name": "Updated Name"}'
```

#### DELETE `/api/assistants/[id]`
Delete an assistant.

**Authentication**: Session or API Key

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/assistants/asst_abc123" \
  -b "session_cookie=your_session"
```

#### POST `/api/assistants/[id]`
Set assistant as default.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "action": "setDefault"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/assistants/asst_abc123" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "setDefault"}'
```

---

### Prompts

Prompts are reusable prompt templates with user-defined variables that can be quickly applied in chat.

#### GET `/api/prompts`
List all prompts for the user.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "name": "string",
    "content": "string",
    "description": "string | null",
    "variables": [
      {
        "name": "string",
        "defaultValue": "string (optional)",
        "description": "string (optional)"
      }
    ],
    "defaultModelId": "string | null",
    "defaultWebSearchMode": "off | standard | deep | null",
    "defaultWebSearchProvider": "linkup | tavily | exa | kagi | perplexity | valyu | null",
    "appendMode": "replace | append | prepend",
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/prompts" \
  -H "Authorization: Bearer your_api_key"
```

#### POST `/api/prompts`
Create a new prompt.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (1-100 chars, required)",
  "content": "string (1-50000 chars, required)",
  "description": "string (max 500 chars, optional)",
  "variables": [
    {
      "name": "string (1-50 chars)",
      "defaultValue": "string (max 1000 chars, optional)",
      "description": "string (max 200 chars, optional)"
    }
  ],
  "defaultModelId": "string (optional)",
  "defaultWebSearchMode": "off | standard | deep (optional)",
  "defaultWebSearchProvider": "linkup | tavily | exa | kagi | perplexity | valyu (optional)",
  "appendMode": "replace | append | prepend (optional, default: replace)"
}
```

**Response**:
```json
{
  "id": "string",
  "name": "string",
  "content": "string",
  ... // other prompt fields
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/prompts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "name": "Summarize Article",
    "content": "Summarize the following article in {{style}} style:\n\n{{text}}",
    "variables": [
      {"name": "style", "defaultValue": "concise"},
      {"name": "text", "description": "The article text to summarize"}
    ]
  }'
```

#### GET `/api/prompts/[id]`
Get a single prompt by ID.

**Authentication**: Session or API Key

**Response**:
```json
{
  "id": "string",
  "name": "string",
  "content": "string",
  ... // other prompt fields
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/prompts/prompt_abc123" \
  -H "Authorization: Bearer your_api_key"
```

#### PATCH `/api/prompts/[id]`
Update a prompt.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (optional)",
  "content": "string (optional)",
  "description": "string | null (optional)",
  "variables": "array | null (optional)",
  "defaultModelId": "string | null (optional)",
  "defaultWebSearchMode": "off | standard | deep | null (optional)",
  "defaultWebSearchProvider": "linkup | tavily | exa | kagi | perplexity | valyu | null (optional)",
  "appendMode": "replace | append | prepend (optional)"
}
```

**CURL Example**:
```bash
curl -X PATCH "http://localhost:3432/api/prompts/prompt_abc123" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{"name": "Updated Prompt Name"}'
```

#### DELETE `/api/prompts/[id]`
Delete a prompt.

**Authentication**: Session or API Key

**Response**:
```json
{
  "success": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/prompts/prompt_abc123" \
  -H "Authorization: Bearer your_api_key"
```

---

### Scheduled Tasks

Scheduled tasks run prompts on a cron, interval, or one-time schedule. All times use the user's timezone setting.

#### GET `/api/scheduled-tasks`
List all scheduled tasks for the user.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string | null",
    "enabled": "boolean",
    "scheduleType": "cron | interval | once",
    "cronExpression": "string | null",
    "intervalSeconds": "number | null",
    "runAt": "date | null",
    "payload": "object",
    "nextRunAt": "date | null",
    "lastRunAt": "date | null",
    "lastRunStatus": "queued | error | null",
    "lastRunError": "string | null",
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/scheduled-tasks" \
  -H "Authorization: Bearer your_api_key"
```

#### POST `/api/scheduled-tasks`
Create a scheduled task.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "enabled": "boolean (optional, default true)",
  "schedule": {
    "type": "cron | interval | once",
    "cron": "string (required if type=cron)",
    "intervalSeconds": "number (required if type=interval)",
    "runAt": "string (ISO date, required if type=once)"
  },
  "payload": {
    "message": "string (required if conversation_id not provided)",
    "model_id": "string (required)",
    "assistant_id": "string (optional)",
    "project_id": "string (optional)",
    "conversation_id": "string (optional)",
    "web_search_mode": "off | standard | deep (optional)",
    "web_search_provider": "linkup | tavily | exa | kagi | perplexity | valyu (optional)",
    "reasoning_effort": "low | medium | high (optional)"
  }
}
```

**Response**:
```json
{
  "id": "string",
  "name": "string",
  "scheduleType": "cron | interval | once",
  "nextRunAt": "date | null",
  "...": "other task fields"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/scheduled-tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "name": "Daily summary",
    "schedule": { "type": "cron", "cron": "0 9 * * *" },
    "payload": { "message": "Summarize my latest project updates.", "model_id": "zai-org/glm-4.7" }
  }'
```

#### PATCH `/api/scheduled-tasks/[id]`
Update a scheduled task.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (optional)",
  "description": "string | null (optional)",
  "enabled": "boolean (optional)",
  "schedule": "schedule object (optional)",
  "payload": "payload object (optional)"
}
```

**CURL Example**:
```bash
curl -X PATCH "http://localhost:3432/api/scheduled-tasks/task_abc123" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{"enabled": false}'
```

#### DELETE `/api/scheduled-tasks/[id]`
Delete a scheduled task.

**Authentication**: Session or API Key

**Response**:
```json
{
  "ok": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/scheduled-tasks/task_abc123" \
  -H "Authorization: Bearer your_api_key"
```

#### POST `/api/scheduled-tasks/[id]/run`
Run a scheduled task immediately.

**Authentication**: Session or API Key

**Response**:
```json
{
  "status": "queued | error",
  "error": "string (optional)",
  "result": {
    "ok": true,
    "conversation_id": "string"
  }
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/scheduled-tasks/task_abc123/run" \
  -H "Authorization: Bearer your_api_key"
```

---

### Projects

#### GET `/api/projects`
List all projects the user owns or is a member of.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string | null",
    "role": "owner" | "member",
    "isShared": "boolean",
    ... // other project fields
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/projects" \
  -b "session_cookie=your_session"
```

#### POST `/api/projects`
Create a new project.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "name": "string (1-100 chars)",
  "description": "string (optional, max 1000 chars)",
  "systemPrompt": "string (optional, max 10000 chars)",
  "color": "string (optional, max 20 chars)"
}
```

**Response**:
```json
{
  "id": "string",
  "name": "string",
  ... // other project fields
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/projects" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"name": "My Project", "description": "A new project"}'
```

#### GET `/api/projects/[id]`
Get a single project with all details.

**Authentication**: Session or API Key

**Response**:
```json
{
  "id": "string",
  "name": "string",
  "role": "owner" | "editor" | "viewer",
  "files": [],
  "members": [],
  "conversations": []
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/projects/proj_abc123" \
  -b "session_cookie=your_session"
```

#### PATCH `/api/projects/[id]`
Update a project.

**Authentication**: Session or API Key (owner or editor)

**Request Body**:
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "systemPrompt": "string (optional)",
  "color": "string (optional)"
}
```

**CURL Example**:
```bash
curl -X PATCH "http://localhost:3432/api/projects/proj_abc123" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"name": "Updated Project Name"}'
```

#### DELETE `/api/projects/[id]`
Delete a project.

**Authentication**: Session or API Key (owner only)

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/projects/proj_abc123" \
  -b "session_cookie=your_session"
```

---

### Project Files

#### GET `/api/projects/[id]/files`
List all files in a project.

**Authentication**: Session or API Key (owner, editor, or viewer)

**Response**:
```json
[
  {
    "id": "string",
    "projectId": "string",
    "storageId": "string",
    "fileName": "string",
    "fileType": "pdf | markdown | text | epub",
    "createdAt": "date",
    "storage": {
      "id": "string",
      "url": "string"
    }
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/projects/proj_abc123/files" \
  -b "session_cookie=your_session"
```

#### POST `/api/projects/[id]/files`
Upload a file to a project. Supports PDF, Markdown, Text, and EPUB files.

**Authentication**: Session or API Key (owner or editor)

**Request Body** (FormData):
- `file`: Binary file (PDF, Markdown, Text, or EPUB)

**Limits**:
- Max file size: 100MB

**Response**:
```json
{
  "id": "string",
  "projectId": "string",
  "storageId": "string",
  "fileName": "string",
  "fileType": "pdf | markdown | text | epub",
  "extractedContent": "string | null",
  "createdAt": "date"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/projects/proj_abc123/files" \
  -b "session_cookie=your_session" \
  -F "file=@document.pdf"
```

#### DELETE `/api/projects/[id]/files`
Delete a file from a project.

**Authentication**: Session or API Key (owner or editor)

**Query Parameters**:
- `fileId`: (Required) The file ID to delete.

**Response**:
```json
{
  "success": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/projects/proj_abc123/files?fileId=file_xyz" \
  -b "session_cookie=your_session"
```

---

### Project Members

#### GET `/api/projects/[id]/members`
List all members of a project, including the owner.

**Authentication**: Session or API Key (owner or member)

**Response**:
```json
[
  {
    "id": "string",
    "userId": "string",
    "role": "owner | editor | viewer",
    "user": {
      "id": "string",
      "name": "string",
      "email": "string",
      "image": "string | null"
    }
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/projects/proj_abc123/members" \
  -b "session_cookie=your_session"
```

#### POST `/api/projects/[id]/members`
Add a member to a project by email.

**Authentication**: Session or API Key (owner only)

**Request Body**:
```json
{
  "email": "string (valid email)",
  "role": "editor | viewer (default: viewer)"
}
```

**Response**:
```json
{
  "id": "string",
  "projectId": "string",
  "userId": "string",
  "role": "string",
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "image": "string | null"
  }
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/projects/proj_abc123/members" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"email": "user@example.com", "role": "editor"}'
```

#### DELETE `/api/projects/[id]/members`
Remove a member from a project.

**Authentication**: Session or API Key (owner, or self-removal)

**Query Parameters**:
- `userId`: (Required) The user ID to remove.

**Response**:
```json
{
  "success": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/projects/proj_abc123/members?userId=user_xyz" \
  -b "session_cookie=your_session"
```

---

### Storage
Files are private by default. Access is granted to the uploader, project members when the file is attached to a project, and anyone when the file is attached to a public conversation.

#### POST `/api/storage`
Upload a file.

**Authentication**: Session or API Key

**Headers**:
- `Content-Type`: Mime type of the file.
- `x-filename`: (Optional) Original filename.

**Limits**:
- Max file size: 100MB

**Request Body**: Binary file content.

**Response**:
```json
{
  "storageId": "string",
  "url": "string"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/storage" \
  -H "Content-Type: image/png" \
  -H "x-filename: screenshot.png" \
  -b "session_cookie=your_session" \
  --data-binary @screenshot.png
```

#### GET `/api/storage`
Get file metadata/URL by ID.

**Authentication**: Session or API Key (owner or project member). Public if attached to a public conversation.

**Query Parameters**:
- `id`: Storage ID.

**Response**:
```json
{
  "url": "/api/storage/..."
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/storage?id=store_abc123"
```

#### GET `/api/storage/gallery`
List user-scoped files for the gallery view.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "filename": "string",
    "mimeType": "string",
    "size": 12345,
    "createdAt": "2025-12-15T12:00:00.000Z",
    "url": "/api/storage/store_abc123",
    "source": "generated_image | message_document | project_file | unlinked",
    "conversationId": "conv_abc123",
    "conversationTitle": "Project ideas",
    "projectId": "proj_abc123",
    "projectName": "Design Project"
  }
]
```

Notes:
- Files are filtered to the authenticated user and exclude avatar files.
- `source` indicates how the file is referenced:
  - `generated_image`: Used in a chat message `images` array.
  - `message_document`: Used in a chat message `documents` array.
  - `project_file`: Linked to a project file.
  - `unlinked`: Not currently referenced by a conversation/project message.

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/storage/gallery" \
  -b "session_cookie=your_session"
```

#### GET `/api/storage/[id]`
Serve the raw file content.

**Authentication**: Session or API Key (owner or project member). Public if attached to a public conversation.

**Response**: Raw file content with appropriate Content-Type.

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/storage/store_abc123" --output file.png
```

#### DELETE `/api/storage`
Delete a file.

**Authentication**: Session or API Key (User must own the file)

**Query Parameters**:
- `id`: Storage ID.

**Response**:
```json
{
  "ok": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/storage?id=store_abc123" \
  -b "session_cookie=your_session"
```

---

### Utilities

#### POST `/api/cancel-generation`
Cancel an active message generation.

**Authentication**: Session or API Key (must own conversation)

**Request Body**:
```json
{
  "conversation_id": "string",
  "session_token": "string"
}
```

**Response**:
```json
{
  "ok": true,
  "cancelled": boolean
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/cancel-generation" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"conversation_id": "conv_abc123", "session_token": "token_xyz"}'
```

#### POST `/api/enhance-prompt`
Enhance a prompt using an LLM to make it better for generation.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "prompt": "string"
}
```

**Response**:
```json
{
  "ok": true,
  "enhanced_prompt": "string"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/enhance-prompt" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"prompt": "make a website"}'
```

#### POST `/api/cleanup-temp-conversations`
Cleanup temporary conversations from previous sessions.

**Authentication**: Session or API Key

**Response**:
```json
{
  "ok": true
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/cleanup-temp-conversations" \
  -b "session_cookie=your_session"
```

---

### Conversations

#### GET `/api/db/conversations`
List all conversations for the user, or get a specific conversation by ID.

**Authentication**: Session or API Key (or Public for shared conversations)

**Query Parameters**:
- `id`: (Optional) Conversation ID to fetch a specific conversation.
- `projectId`: (Optional) Filter by project. Use `"null"` for non-project conversations.
- `search`: (Optional) Search term for conversation search.
- `mode`: (Optional) Search mode: `'exact'`, `'words'`, or `'fuzzy'`.

**Response** (list):
```json
[
  {
    "id": "string",
    "title": "string",
    "userId": "string",
    "projectId": "string | null",
    "pinned": "boolean",
    "generating": "boolean",
    "costUsd": "number | null",
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/conversations" \
  -b "session_cookie=your_session"

# With search
curl -X GET "http://localhost:3432/api/db/conversations?search=python&mode=fuzzy" \
  -b "session_cookie=your_session"
```

#### POST `/api/db/conversations`
Create or update conversations.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "action": "create" | "createWithMessage" | "branch" | "updateTitle" | "setProject" | "updateGenerating" | "updateCost" | "setPublic" | "togglePin",
  // Additional fields depend on action
}
```

**Actions**:
- `create`: Create new conversation. Fields: `title`, `projectId`.
- `createWithMessage`: Create conversation with first message. Fields: `content`, `contentHtml`, `role`, `images`, `webSearchEnabled`, `projectId`.
- `branch`: Branch from existing message. Fields: `conversationId`, `fromMessageId`.
- `updateTitle`: Update title. Fields: `conversationId`, `title`.
- `setProject`: Move conversation to a project (or remove it). Fields: `conversationId`, `projectId` (string or `null`).
- `setPublic`: Make conversation public. Fields: `conversationId`, `public`.
- `togglePin`: Toggle pin status. Fields: `conversationId`.

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/conversations" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "create", "title": "New Chat"}'
```

#### DELETE `/api/db/conversations`
Delete a conversation or all conversations.

**Authentication**: Session or API Key

**Query Parameters**:
- `id`: Conversation ID to delete.
- `all`: Set to `"true"` to delete all conversations.

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/db/conversations?id=conv_abc123" \
  -b "session_cookie=your_session"
```

---

### Messages

#### GET `/api/db/messages`
Get messages for a conversation.

**Authentication**: Session or API Key (or Public for public conversations)

**Query Parameters**:
- `conversationId`: (Required) Conversation ID.
- `public`: Set to `"true"` for public conversations.

**Response**:
```json
[
  {
    "id": "string",
    "conversationId": "string",
    "role": "user" | "assistant" | "system",
    "content": "string",
    "contentHtml": "string | null",
    "modelId": "string | null",
    "reasoning": "string | null",
    "starred": "boolean",
    "images": "array | null",
    "documents": "array | null",
    "createdAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/messages?conversationId=conv_abc123" \
  -b "session_cookie=your_session"
```

#### POST `/api/db/messages`
Create or update messages.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "action": "create" | "updateContent" | "update" | "updateError" | "delete" | "setStarred",
  // Additional fields depend on action
}
```

**Action: `setStarred`**
```json
{
  "action": "setStarred",
  "messageId": "string",
  "starred": true
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/messages" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "create", "conversationId": "conv_abc123", "role": "user", "content": "Hello!"}'
```

**CURL Example (`setStarred`)**:
```bash
curl -X POST "http://localhost:3432/api/db/messages" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "setStarred", "messageId": "msg_abc123", "starred": true}'
```

#### GET `/api/starred-messages`
Get all starred messages for the current user.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "conversationId": "string",
    "role": "user" | "assistant" | "system",
    "content": "string",
    "contentHtml": "string | null",
    "modelId": "string | null",
    "reasoning": "string | null",
    "starred": "boolean",
    "images": "array | null",
    "documents": "array | null",
    "createdAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/starred-messages" \
  -b "session_cookie=your_session"
```

---

### Message Interactions

#### POST `/api/db/message-interactions`
Log a user interaction with a message (regenerate, edit, copy, share).

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "messageId": "string (required)",
  "action": "regenerate | edit | copy | share",
  "metadata": "object (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "interaction": {
    "id": "string",
    "messageId": "string",
    "userId": "string",
    "action": "string",
    "metadata": "object | null",
    "createdAt": "date"
  }
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/message-interactions" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"messageId": "msg_abc123", "action": "copy"}'
```

---

### Message Ratings

#### POST `/api/db/message-ratings`
Rate a message (thumbs up/down, star rating, feedback).

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "messageId": "string (required)",
  "thumbs": "up | down (optional)",
  "rating": "number 1-5 (optional)",
  "categories": "array of strings (optional)",
  "feedback": "string (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "rating": {
    "id": "string",
    "messageId": "string",
    "userId": "string",
    "thumbs": "string | null",
    "rating": "number | null",
    "categories": "array | null",
    "feedback": "string | null",
    "createdAt": "date"
  }
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/message-ratings" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"messageId": "msg_abc123", "thumbs": "up", "feedback": "Great response!"}'
```

---

### Model Performance

#### GET `/api/db/model-performance`
Get model performance statistics for the user.

**Authentication**: Session or API Key

**Query Parameters**:
- `recalculate`: Set to `"true"` to recalculate stats from scratch.

**Response**:
```json
{
  "success": true,
  "stats": [
    {
      "modelId": "string",
      "totalMessages": "number",
      "averageTokens": "number",
      "averageLatency": "number",
      ...
    }
  ]
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/model-performance" \
  -b "session_cookie=your_session"

# Force recalculation
curl -X GET "http://localhost:3432/api/db/model-performance?recalculate=true" \
  -b "session_cookie=your_session"
```

---

### Analytics

#### GET `/api/analytics`
Get model analytics for the user (stats + insights).

**Authentication**: Session or API Key

**Query Parameters**:
- `recalculate`: Set to `"false"` to use cached stats. Defaults to `"true"`.

**Response**:
```json
{
  "success": true,
  "stats": [
    {
      "id": "string",
      "modelId": "string",
      "provider": "string",
      "totalMessages": "number",
      "avgRating": "number | null",
      "thumbsUpCount": "number",
      "thumbsDownCount": "number",
      "regenerateCount": "number",
      "avgResponseTime": "number | null",
      "avgTokens": "number | null",
      "totalCost": "number",
      "errorCount": "number",
      "accurateCount": "number",
      "helpfulCount": "number",
      "creativeCount": "number",
      "fastCount": "number",
      "costEffectiveCount": "number"
    }
  ],
  "insights": {
    "totalMessages": "number",
    "totalCost": "number",
    "avgRating": "number | null",
    "mostUsedModel": "ModelPerformanceStat | null",
    "bestRatedModel": "ModelPerformanceStat | null",
    "mostCostEffective": "ModelPerformanceStat | null",
    "fastestModel": "ModelPerformanceStat | null"
  }
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/analytics" \
  -b "session_cookie=your_session"

# Use cached stats
curl -X GET "http://localhost:3432/api/analytics?recalculate=false" \
  -b "session_cookie=your_session"
```

---

### User Settings

#### GET `/api/db/user-settings`
Get user settings.

**Authentication**: Session or API Key

**Response**:
```json
{
  "userId": "string",
  "timezone": "string (IANA timezone, e.g. America/Los_Angeles)",
  "privacyMode": "boolean",
  "contextMemoryEnabled": "boolean",
  "persistentMemoryEnabled": "boolean",
  "suggestedPromptsEnabled": "boolean",
  "theme": "string | null",
  ...
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/user-settings" \
  -b "session_cookie=your_session"
```

#### POST `/api/db/user-settings`
Update user settings.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "action": "update",
  "timezone": "string (optional, IANA timezone)",
  "privacyMode": "boolean (optional)",
  "contextMemoryEnabled": "boolean (optional)",
  "suggestedPromptsEnabled": "boolean (optional)",
  ...
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/user-settings" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "update", "privacyMode": true}'
```

---

### User Provider Keys

#### GET `/api/db/user-keys`
Get API keys configured by the user for different providers.

**Authentication**: Session or API Key

**Query Parameters**:
- `provider`: (Optional) Get key for a specific provider (e.g., "nanogpt", "openai").

**Response**:
```json
// Single provider
"sk-..." 

// All providers
{
  "nanogpt": "sk-...",
  "openai": "sk-..."
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/user-keys" \
  -b "session_cookie=your_session"

# Get specific provider
curl -X GET "http://localhost:3432/api/db/user-keys?provider=nanogpt" \
  -b "session_cookie=your_session"
```

#### POST `/api/db/user-keys`
Set an API key for a provider.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "provider": "string (required)",
  "key": "string (required)"
}
```

**Response**:
```json
{
  "userId": "string",
  "provider": "string",
  "createdAt": "date"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/user-keys" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"provider": "nanogpt", "key": "sk-your-api-key"}'
```

#### DELETE `/api/db/user-keys`
Delete an API key for a provider.

**Authentication**: Session or API Key

**Query Parameters**:
- `provider`: (Required) Provider name to delete key for.

**Response**:
```json
{
  "ok": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/db/user-keys?provider=nanogpt" \
  -b "session_cookie=your_session"
```

---

### User Rules

#### GET `/api/db/user-rules`
Get all custom rules for the user.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "name": "string",
    "attach": "boolean",
    "rule": "string",
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/user-rules" \
  -b "session_cookie=your_session"
```

#### POST `/api/db/user-rules`
Create, update, or rename a rule.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "action": "create | update | rename",
  // For create:
  "name": "string",
  "attach": "boolean",
  "rule": "string",
  // For update:
  "ruleId": "string",
  "attach": "boolean",
  "rule": "string",
  // For rename:
  "ruleId": "string",
  "name": "string"
}
```

**Response**:
```json
{
  "id": "string",
  "name": "string",
  "attach": "boolean",
  "rule": "string",
  ...
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/user-rules" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "create", "name": "Code Style", "attach": true, "rule": "Always use TypeScript."}'
```

#### DELETE `/api/db/user-rules`
Delete a rule.

**Authentication**: Session or API Key

**Query Parameters**:
- `id`: (Required) Rule ID to delete.

**Response**:
```json
{
  "ok": true
}
```

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/db/user-rules?id=rule_abc123" \
  -b "session_cookie=your_session"
```

---

### User Models

#### GET `/api/db/user-models`
Get enabled models for the user.

**Authentication**: Session or API Key

**Query Parameters**:
- `provider`: (Optional) Filter by provider.
- `modelId`: (Optional) Get specific model.

**Response**:
```json
[
  {
    "modelId": "string",
    "provider": "string",
    "enabled": "boolean",
    "pinned": "boolean"
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/db/user-models" \
  -b "session_cookie=your_session"
```

#### POST `/api/db/user-models`
Enable/disable models or toggle pinned status.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "action": "set" | "togglePinned" | "enableInitial",
  "provider": "string",
  "modelId": "string",
  "enabled": "boolean"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/db/user-models" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"action": "set", "provider": "openai", "modelId": "gpt-4", "enabled": true}'
```

#### GET `/api/models`
Get all available models with capabilities and user's enabled/pinned status.

**Authentication**: Session or API Key

**Response**:
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "enabled": "boolean",
    "pinned": "boolean",
    "capabilities": {
      "vision": "boolean",
      "reasoning": "boolean",
      "images": "boolean",
      "video": "boolean"
    },
    "pricing": {
      "prompt": "string",
      "completion": "string",
      "image": "string",
      "request": "string"
    },
    "subscription": {
      "included": "boolean",
      "note": "string"
    },
    "resolutions": [
        {
            "value": "string",
            "comment": "string"
        }
    ],
    "additionalParams": {
        "key": {
            "type": "string",
            "label": "string",
            "description": "string",
            "default": "any",
            "options": [
                {
                    "label": "string",
                    "value": "any"
                }
            ]
        }
    },
    "maxImages": "number (optional)",
    "defaultSettings": {
        "resolution": "string (optional)",
        "nImages": "number (optional)"
    }
  }
]
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/models" \
  -b "session_cookie=your_session"
```

---

#### GET `/api/models/[modelId]/info`
Get detailed model info (including benchmarks) for a single model. Intended to be called on-demand when the user requests more details.

**Authentication**: Session or API Key

**Path Parameters**:
- `modelId`: (Required) Model ID.

**Response**:
```json
{
  "model": {
    "id": "string",
    "name": "string",
    "description": "string",
    "icon_url": "string",
    "owned_by": "string",
    "context_length": "number",
    "max_output_tokens": "number",
    "created": "number",
    "pricing": {
      "prompt": "string",
      "completion": "string",
      "image": "string",
      "request": "string"
    },
    "cost_estimate": "number",
    "subscription": {
      "included": "boolean",
      "note": "string"
    },
    "capabilities": {
      "vision": "boolean",
      "reasoning": "boolean",
      "images": "boolean",
      "video": "boolean"
    }
  },
  "benchmarks": {
    "available": "boolean",
    "stale": "boolean",
    "source": "string",
    "source_url": "string",
    "llm": {
      "name": "string",
      "slug": "string",
      "intelligence": "number",
      "coding": "number",
      "math": "number",
      "speed_tokens_per_second": "number"
    },
    "image": {
      "name": "string",
      "slug": "string",
      "elo": "number",
      "rank": "number"
    }
  }
}
```

**Notes**:
- Uses cached Artificial Analysis data (1 hour TTL). `available` will be `false` if `ARTIFICIAL_ANALYSIS_API_KEY` is not configured.
- `llm`/`image` benchmark blocks are omitted when no match is found.

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/models/gpt-4/info" \
  -b "session_cookie=your_session"
```

---

### Model Providers

#### GET `/api/model-providers`
Get available providers for a model.

**Authentication**: Session or API Key

**Query Parameters**:
- `modelId`: (Required) Model ID.

**Response**:
```json
{
  "canonicalId": "string",
  "displayName": "string",
  "supportsProviderSelection": "boolean",
  "providers": []
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/model-providers?modelId=gpt-4" \
  -b "session_cookie=your_session"
```

---

### NanoGPT Account

#### POST `/api/nano-gpt/balance`
Get the NanoGPT account balance.

**Authentication**: Session or API Key

**Response**:
```json
{
  "balance": "number",
  "currency": "string"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/nano-gpt/balance" \
  -b "session_cookie=your_session"
```

#### GET `/api/nano-gpt/subscription-usage`
Get the NanoGPT subscription usage statistics.

**Authentication**: Session or API Key

**Response**:
```json
{
  "used": "number",
  "limit": "number",
  "resetDate": "date"
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/nano-gpt/subscription-usage" \
  -b "session_cookie=your_session"
```

---

### Artificial Analysis Benchmarks

#### GET `/api/artificial-analysis/benchmarks`
Get cached benchmark data from Artificial Analysis for LLM and image models.

**Authentication**: Session

**Response**:
```json
{
  "available": true,
  "llms": [
    {
      "name": "Claude 3.5 Sonnet",
      "slug": "claude-35-sonnet",
      "evaluations": {
        "intelligence_index": 64.2,
        "coding_index": 72.1,
        "math_index": 68.5
      },
      "median_output_tokens_per_second": 92.5
    }
  ],
  "imageModels": [
    {
      "name": "DALL-E 3",
      "slug": "dalle-3",
      "elo": 1180,
      "rank": 5
    }
  ]
}
```

**Notes**:
- Returns `{ "available": false }` if `ARTIFICIAL_ANALYSIS_API_KEY` is not configured
- Data is cached server-side for 1 hour to minimize API calls
- Used by the model info panel to display performance benchmarks

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/artificial-analysis/benchmarks" \
  -b "session_cookie=your_session"
```

---

### Provider Preferences

#### GET `/api/provider-preferences`
Get user's provider preferences.

**Authentication**: Session or API Key

**Response**:
```json
{
  "preferredProviders": ["openai", "anthropic"],
  "excludedProviders": [],
  "enableFallback": true,
  "modelOverrides": {}
}
```

**CURL Example**:
```bash
curl -X GET "http://localhost:3432/api/provider-preferences" \
  -b "session_cookie=your_session"
```

#### PATCH `/api/provider-preferences`
Update user's provider preferences.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "preferredProviders": ["string"],
  "excludedProviders": ["string"],
  "enableFallback": boolean,
  "modelOverrides": {
    "modelId": {
      "preferredProviders": ["string"],
      "enableFallback": boolean
    }
  }
}
```

**CURL Example**:
```bash
curl -X PATCH "http://localhost:3432/api/provider-preferences" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"preferredProviders": ["openai", "anthropic"], "enableFallback": true}'
```

#### DELETE `/api/provider-preferences`
Reset provider preferences.

**Authentication**: Session or API Key

**CURL Example**:
```bash
curl -X DELETE "http://localhost:3432/api/provider-preferences" \
  -b "session_cookie=your_session"
```

---

### Follow-up Questions

#### POST `/api/generate-follow-up-questions`
Generate follow-up questions for a message.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "conversationId": "string",
  "messageId": "string"
}
```

**Response**:
```json
{
  "ok": true,
  "suggestions": ["string"]
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/generate-follow-up-questions" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"conversationId": "conv_abc123", "messageId": "msg_xyz"}'
```

---

### User Profile

#### POST `/api/user/upload-avatar`
Upload an avatar image for the current user.

**Authentication**: Session or API Key

**Request Body** (FormData):
- `file`: Image file (JPEG, PNG, GIF, or WebP, max 5MB)

**Response**:
```json
{
  "success": true,
  "imageUrl": "/api/storage/..."
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/user/upload-avatar" \
  -b "session_cookie=your_session" \
  -F "file=@avatar.png"
```

---

### KaraKeep

#### POST `/api/karakeep/save-chat`
Save a conversation to KaraKeep.

**Authentication**: Session or API Key

**Request Body**:
```json
{
  "conversationId": "string"
}
```

**Response**:
```json
{
  "success": true,
  "bookmarkId": "string",
  "message": "string"
}
```

**CURL Example**:
```bash
curl -X POST "http://localhost:3432/api/karakeep/save-chat" \
  -H "Content-Type: application/json" \
  -b "session_cookie=your_session" \
  -d '{"conversationId": "conv_abc123"}'
```

---

### Authentication (Better Auth)

The `/api/auth/[...auth]` endpoints are handled by Better Auth and provide standard authentication flows including:
- Session management
- OAuth providers
- Email/password authentication

Refer to the [Better Auth documentation](https://www.better-auth.com/) for detailed endpoint information.
