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
