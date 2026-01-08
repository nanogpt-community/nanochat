# API Documentation

This document provides an overview of the API endpoints available in the application.

## Authentication

The API supports two methods of authentication:
1. **Session Cookie**: For browser-based authenticated sessions.
2. **API Key**: For external tools and scripts. Use the `Authorization: Bearer <your_api_key>` header.

## Endpoints

### Generation

#### POST `/api/generate-message`
Generates a response from an AI model. This is the core endpoint for chat functionality.

**Authentication**: Session or API Key

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
  "web_search_provider": "enum: 'linkup' | 'tavily' | 'exa' | 'kagi' (optional)",
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
  "reasoning_effort": "enum: 'low' | 'medium' | 'high' (optional)",
  "temporary": "boolean (optional)",
  "provider_id": "string (optional)"
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

### Text-to-Speech

#### POST `/api/tts`
Proxies requests to NanoGPT TTS API for speech synthesis.

**Authentication**: Session

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

### Speech-to-Text

#### POST `/api/stt`
Proxies audio files to NanoGPT STT API for transcription.

**Authentication**: Session

**Request Body** (FormData):
- `audio`: Binary audio file (webm, mp4, etc).
- `model`: "string (optional, default: 'Whisper-Large-V3')"

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
 
 ### API Keys

#### GET `/api/api-keys`
List active API keys for the current user.

**Authentication**: Session

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

#### POST `/api/api-keys`
Create a new API key.

**Authentication**: Session

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

#### DELETE `/api/api-keys`
Revoke an API key.

**Authentication**: Session

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

### Assistants

#### GET `/api/assistants`
List all assistants for the user. If no assistants exist, a default one is created and returned.

**Authentication**: Session

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
    "createdAt": "date",
    "updatedAt": "date"
  }
]
```

#### POST `/api/assistants`
Create a new assistant.

**Authentication**: Session

**Request Body**:
```json
{
  "name": "string (1-100 chars)",
  "systemPrompt": "string (max 10000 chars)",
  "defaultModelId": "string (optional)",
  "defaultWebSearchMode": "enum: 'off' | 'standard' | 'deep' (optional)",
  "defaultWebSearchProvider": "enum: 'linkup' | 'tavily' | 'exa' | 'kagi' (optional)"
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

### Projects

#### GET `/api/projects`
List all projects the user owns or is a member of.

**Authentication**: Session

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

#### POST `/api/projects`
Create a new project.

**Authentication**: Session

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

### Storage

#### POST `/api/storage`
Upload a file.

**Authentication**: Session

**Headers**:
- `Content-Type`: Mime type of the file.
- `x-filename`: (Optional) Original filename.

**Request Body**: Binary file content.

**Response**:
```json
{
  "storageId": "string",
  "url": "string"
}
```

#### GET `/api/storage`
Get file metadata/URL by ID.

**Authentication**: Public (via ID)

**Query Parameters**:
- `id`: Storage ID.

**Response**:
```json
{
  "url": "/api/storage/..."
}
```

#### GET `/api/storage/[id]`
Serve the raw file content.

**Authentication**: Public (via ID)

**Response**: Raw file content with appropriate Content-Type.

#### DELETE `/api/storage`
Delete a file.

**Authentication**: Session (User must own the file)

**Query Parameters**:
- `id`: Storage ID.

**Response**:
```json
{
  "ok": true
}
```

### Utilities

#### POST `/api/cancel-generation`
Cancel an active message generation.

**Authentication**: Session (must own conversation)

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

#### POST `/api/enhance-prompt`
Enhance a prompt using an LLM to make it better for generation.

**Authentication**: Session

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

---

### Conversations

#### GET `/api/db/conversations`
List all conversations for the user, or get a specific conversation by ID.

**Authentication**: Session (or Public for shared conversations)

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

#### POST `/api/db/conversations`
Create or update conversations.

**Authentication**: Session

**Request Body**:
```json
{
  "action": "create" | "createWithMessage" | "branch" | "updateTitle" | "updateGenerating" | "updateCost" | "setPublic" | "togglePin",
  // Additional fields depend on action
}
```

**Actions**:
- `create`: Create new conversation. Fields: `title`, `projectId`.
- `createWithMessage`: Create conversation with first message. Fields: `content`, `contentHtml`, `role`, `images`, `webSearchEnabled`, `projectId`.
- `branch`: Branch from existing message. Fields: `conversationId`, `fromMessageId`.
- `updateTitle`: Update title. Fields: `conversationId`, `title`.
- `setPublic`: Make conversation public. Fields: `conversationId`, `public`.
- `togglePin`: Toggle pin status. Fields: `conversationId`.

#### DELETE `/api/db/conversations`
Delete a conversation or all conversations.

**Authentication**: Session

**Query Parameters**:
- `id`: Conversation ID to delete.
- `all`: Set to `"true"` to delete all conversations.

---

### Messages

#### GET `/api/db/messages`
Get messages for a conversation.

**Authentication**: Session (or Public for public conversations)

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
    "images": "array | null",
    "documents": "array | null",
    "createdAt": "date"
  }
]
```

#### POST `/api/db/messages`
Create or update messages.

**Authentication**: Session

**Request Body**:
```json
{
  "action": "create" | "updateContent" | "update" | "updateError" | "delete",
  // Additional fields depend on action
}
```

---

### User Settings

#### GET `/api/db/user-settings`
Get user settings.

**Authentication**: Session

**Response**:
```json
{
  "userId": "string",
  "privacyMode": "boolean",
  "contextMemoryEnabled": "boolean",
  "persistentMemoryEnabled": "boolean",
  "theme": "string | null",
  ...
}
```

#### POST `/api/db/user-settings`
Update user settings.

**Authentication**: Session

**Request Body**:
```json
{
  "action": "update",
  "privacyMode": "boolean (optional)",
  "contextMemoryEnabled": "boolean (optional)",
  ...
}
```

---

### User Models

#### GET `/api/db/user-models`
Get enabled models for the user.

**Authentication**: Session

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

#### POST `/api/db/user-models`
Enable/disable models or toggle pinned status.

**Authentication**: Session

**Request Body**:
```json
{
  "action": "set" | "togglePinned" | "enableInitial",
  "provider": "string",
  "modelId": "string",
  "enabled": "boolean"
}
```

---

### Model Providers

#### GET `/api/model-providers`
Get available providers for a model.

**Authentication**: Session

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

---

### Assistants (Extended)

#### PATCH `/api/assistants/[id]`
Update an assistant.

**Authentication**: Session

**Request Body**:
```json
{
  "name": "string (optional)",
  "systemPrompt": "string (optional)",
  "defaultModelId": "string | null (optional)",
  "defaultWebSearchMode": "enum (optional)"
}
```

#### DELETE `/api/assistants/[id]`
Delete an assistant.

**Authentication**: Session

#### POST `/api/assistants/[id]`
Set assistant as default.

**Authentication**: Session

**Request Body**:
```json
{
  "action": "setDefault"
}
```

---

### Projects (Extended)

#### GET `/api/projects/[id]`
Get a single project with all details.

**Authentication**: Session

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

#### PATCH `/api/projects/[id]`
Update a project.

**Authentication**: Session (owner or editor)

**Request Body**:
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "systemPrompt": "string (optional)",
  "color": "string (optional)"
}
```

#### DELETE `/api/projects/[id]`
Delete a project.

**Authentication**: Session (owner only)

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
