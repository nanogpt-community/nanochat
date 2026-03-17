# Agent Development Guidelines

## API Documentation Requirement

**IMPORTANT**: Whenever making changes to API endpoints, you MUST update the `api-docs.md` file to reflect those changes.

## When to Update api-docs.md

Update the documentation when:

1. **Creating a new endpoint** - Add full documentation including:
   - HTTP method and path
   - Authentication requirement (Session, API Key, or Public)
   - Request body schema (if applicable)
   - Query parameters (if applicable)
   - Response schema
   - CURL example

2. **Modifying an existing endpoint** - Update:
   - Request/response schema changes
   - Authentication changes
   - New query parameters or body fields

3. **Deleting an endpoint** - Remove the endpoint from documentation

4. **Changing authentication** - Update the `**Authentication**:` line

## Authentication Types

Use one of these authentication labels:

- `**Authentication**: Session or API Key` - Most common for authenticated endpoints
- `**Authentication**: Session or API Key (owner only)` - When ownership is required
- `**Authentication**: Session or API Key (owner or editor)` - Role-based access
- `**Authentication**: None` - Public endpoints
- `**Authentication**: Session` - Session-only endpoints (TTS/STT use this pattern)

## Authentication Implementation

For new authenticated endpoints, use the shared auth utility:

```typescript
import { getAuthenticatedUserId } from '$lib/backend/auth-utils';

export async function GET({ request }: RequestEvent) {
    const userId = await getAuthenticatedUserId(request);
    // ... endpoint logic
}
```

For optional authentication (public with optional user context):

```typescript
import { tryGetAuthenticatedUserId } from '$lib/backend/auth-utils';

export async function GET({ request }: RequestEvent) {
    const userId = await tryGetAuthenticatedUserId(request);
    // userId may be undefined if not authenticated
}
```

## Documentation Format

Follow this template when adding a new endpoint:

```markdown
#### METHOD `/api/endpoint-path`
Brief description of what the endpoint does.

**Authentication**: Session or API Key

**Request Body**:
\`\`\`json
{
  "field": "type (description)"
}
\`\`\`

**Response**:
\`\`\`json
{
  "field": "type"
}
\`\`\`

**CURL Example**:
\`\`\`bash
curl -X METHOD "http://localhost:3432/api/endpoint-path" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{"field": "value"}'
\`\`\`
```

## Reference Files

- API documentation: `api-docs.md`
- Auth utility: `src/lib/backend/auth-utils.ts`
- API endpoints: `src/routes/api/`
