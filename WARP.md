# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Setup
```bash
# Install dependencies
bun install

# Setup environment variables
cp .env.example .env
# Edit .env and set BETTER_AUTH_SECRET, NANOGPT_API_KEY, and other required values

# Apply database migrations (run after pulling schema changes)
npx drizzle-kit push
```

### Development
```bash
# Start dev server (default: localhost:5173)
bun run dev

# Start dev server with network access
bun run dev:host

# Build for production
bun run build

# Preview production build
bun run preview
```

### Database
```bash
# Push schema changes to database (use after modifying src/lib/db/schema.ts)
npx drizzle-kit push

# Generate migrations
npx drizzle-kit generate

# Open Drizzle Studio to inspect database
npx drizzle-kit studio
```

### Code Quality
```bash
# Format code
bun run format

# Lint code (runs prettier check + eslint)
bun run lint

# Type check
bun run check

# Type check in watch mode
bun run check:watch
```

### Testing
```bash
# Run all tests
bun run test

# Run unit tests (vitest)
bun run test:unit

# Run e2e tests (playwright)
bun run test:e2e
```

### Docker
```bash
# Build and run with docker compose
docker compose up --build

# Run in background
docker compose up -d

# View logs
docker compose logs -f

# Stop containers
docker compose down
```

## Architecture Overview

### Tech Stack
- **Framework**: SvelteKit 2 with Svelte 5 (using runes)
- **Runtime**: Bun (use `bun` commands, not `npm`)
- **Database**: SQLite with Drizzle ORM
- **Adapter**: `svelte-adapter-bun` for production
- **Authentication**: Better Auth with passkey support
- **Styling**: Tailwind CSS 4 with custom design system
- **AI Integration**: Nano-GPT API (nano-gpt.com)

### Database Architecture
- **ORM**: Drizzle with Bun SQLite driver
- **Schema**: Located in `src/lib/db/schema.ts` (single source of truth)
- **Connection**: Initialized in `src/lib/db/index.ts` with WAL mode enabled
- **Migrations**: Auto-run on server startup via `src/hooks.server.ts`
- **Database file**: `data/thom-chat.db` (created automatically)

Key tables:
- Better Auth tables: `user`, `session`, `account`, `verification`, `passkey`
- Application tables: `conversations`, `messages`, `storage`, `userSettings`, `userKeys`, `userEnabledModels`, `userRules`, `assistants`, `userMemories`
- Analytics: `messageRatings`, `messageInteractions`, `modelPerformanceStats`

### Authentication Flow
- Uses Better Auth with email/password + passkey support
- Auth configuration: `src/lib/auth.ts`
- Session management with cookie caching (5 min)
- Auto-creates user settings on signup via database hooks
- Passkey requires HTTPS in production (set via `BETTER_AUTH_URL`)

### API Structure
All API routes are in `src/routes/api/`:
- `/api/auth/[...auth]` - Better Auth endpoints
- `/api/generate-message` - Main chat completion endpoint (streams responses)
- `/api/db/*` - Database CRUD operations (conversations, messages, user settings, etc.)
- `/api/assistants` - Custom assistant management
- `/api/cancel-generation` - Cancel streaming responses

### Nano-GPT Integration
- Model fetching: `src/lib/backend/models/nano-gpt.ts`
- Supports text, image, and video generation models
- Server can provide shared API key via `NANOGPT_API_KEY` env var
- Users can also use their own API keys (stored in `userKeys` table)
- Features: web search, web scraping, context memory, YouTube transcripts, KaraKeep integration

### Component Architecture
- Main layout: `src/routes/+layout.svelte` (handles theme, auth context)
- Account pages: `src/routes/account/*` (settings, models, API keys, assistants, analytics)
- Chat interface: `src/routes/chat/[conversationId]`
- Shared components: `src/lib/components/`
  - `ui/` - Reusable UI primitives (button, card, dropdown-menu, etc.)
  - `model-picker/` - Model selection interface
  - `account/` - Account-specific components

### State Management
- Local state using Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Custom state utilities in `src/lib/state/`
- Cache utilities: `src/lib/cache/` (LRU cache, session cache, cached queries)
- Client-side mutations: `src/lib/client/mutation.svelte.ts`

### File Upload & Storage
- Files stored locally in `data/` directory (not in database)
- Metadata tracked in `storage` table
- Supports PDFs, EPUBs, images, and text documents
- File processing utilities in `src/lib/backend/`

### Environment Variables
Required:
- `BETTER_AUTH_SECRET` - Secret for session encryption (generate with `openssl rand -base64 32`)
- `BETTER_AUTH_URL` - Full URL including protocol (e.g., https://example.com)

Optional:
- `NANOGPT_API_KEY` - Server-side API key for shared access
- `DISABLE_SIGNUPS` - Set to "true" to prevent new registrations
- `SUBSCRIPTION_MODELS_ONLY` - Restrict to subscription models when using server key
- `DAILY_MESSAGE_LIMIT` - Limit messages per day (0 = unlimited)
- `BODY_SIZE_LIMIT` - Max upload size in bytes (default: 50MB)

## Development Guidelines

### Working with Database
- Always modify schema in `src/lib/db/schema.ts`
- After schema changes, run `npx drizzle-kit push` to update database
- Use Drizzle query utilities in `src/lib/db/queries.ts` for complex queries
- Migrations auto-run on server startup

### SvelteKit Conventions
- Server-only code: `+page.server.ts`, `+layout.server.ts`, `+server.ts`
- Universal load functions: Use when data can be fetched client or server side
- Form actions: Export from `+page.server.ts` for progressive enhancement
- API routes: Create `+server.ts` files with `GET`, `POST`, etc. exports

### Svelte 5 Patterns
- Use `$state()` for reactive state
- Use `$derived()` for computed values
- Use `$effect()` for side effects
- Avoid using legacy `$:` reactive statements
- Props destructure with types: `let { prop }: { prop: Type } = $props()`

### Styling
- Tailwind CSS 4 with custom theme in `src/lib/themes/`
- Theme selector in account settings
- Use `clsx` or `tailwind-merge` for conditional classes
- Icon system: `unplugin-icons` (import from `~icons/[collection]/[icon]`)

### Testing
- Unit tests: Place `.test.ts` or `.spec.ts` next to source files
- Svelte component tests: Use `.svelte.test.ts` or `.svelte.spec.ts`
- E2E tests: Place in `e2e/` directory
- Run specific test: `bun test src/path/to/file.test.ts`

### Type Safety
- Strict TypeScript enabled with `noUncheckedIndexedAccess`
- Database types auto-generated from schema (export types from schema.ts)
- Use Zod for runtime validation (especially in API routes)
- Never use `any` - prefer `unknown` and type guards
