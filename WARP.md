# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview
This is a SvelteKit application ("thom.chat") which is a self-hostable AI chat interface. It is a fork of a T3 Chat clone, modified to use SQLite instead of Convex, and Bun instead of Yarn/Node. It integrates with Nano-GPT for AI models.

## Tech Stack
-   **Framework**: SvelteKit (TypeScript)
-   **Runtime/Package Manager**: Bun
-   **Database**: SQLite (via Drizzle ORM)
-   **Styling**: Tailwind CSS
-   **Auth**: BetterAuth
-   **Testing**: Vitest (Unit), Playwright (E2E)

## Architecture & Structure

### Core Directories
-   `src/routes`: SvelteKit file-based routing. Contains both UI pages (`+page.svelte`) and API endpoints (`+server.ts`).
    -   `api/`: API endpoints mirroring the old Convex backend pattern
        -   `db/`: Database operations (conversations, messages, user-settings, etc.)
        -   `auth/`: BetterAuth integration endpoints
        -   `generate-message/`: AI message generation endpoint
        -   `nano-gpt/`: Nano-GPT specific endpoints (image gen, video gen, etc.)
        -   `storage/`: File upload/storage handling
    -   `chat/[id]/`: Individual chat pages
    -   `account/`: User account management pages
    -   `assistants/`: Custom assistant configuration
-   `src/lib`: Shared utilities and code.
    -   `db/`: Drizzle ORM configuration
        -   `schema.ts`: Database schema (Better Auth tables + application tables)
        -   `queries/`: Type-safe query functions for each entity
    -   `backend/`: Server-side logic
        -   `auth/`: Auth utilities
        -   `models/`: AI model configuration and utilities
        -   `url-scraper.ts`: Web scraping for Nano-GPT context
        -   `web-search.ts`: Web search integration
    -   `components/`: Reusable UI components (Melt UI, Bits UI)
    -   `spells/`: Svelte-specific reactive utilities ("spells" are reactive state helpers)
    -   `actions/`: Svelte actions for DOM manipulation
    -   `state/`: Client-side state management
    -   `api.ts`: Client-side API wrapper that replaces Convex patterns with SvelteKit endpoints
    -   `auth.ts`: BetterAuth instance configuration

### Key Concepts
-   **Database**: Uses SQLite with Drizzle ORM. The database file is located at `./data/thom-chat.db` (configured in `drizzle.config.ts`).
    -   Schema includes Better Auth tables (user, session, account, passkey) and application tables (conversations, messages, user_settings, user_rules, etc.)
    -   Queries are organized in `src/lib/db/queries/` by entity
    -   Migrations run automatically in production mode on server startup (see `hooks.server.ts`)
-   **Authentication**: Handled by BetterAuth with passkey support (requires HTTPS).
    -   Configured in `src/lib/auth.ts`
    -   User settings are automatically created on signup via database hooks
-   **AI Integration**: 
    -   Primary: Nano-GPT (nano-gpt.com) with web search, scraping, image/video generation
    -   Supports 400+ models through API integration
    -   Context memory (single chat) and persistent memory (cross-chat) features
-   **Convex Migration**: This is a fork that replaced Convex with SQLite. The `src/lib/api.ts` file provides a compatibility layer that mimics Convex API patterns but uses SvelteKit API routes.

## Development Workflow

### Setup
1.  Install dependencies:
    ```bash
    bun install
    ```
2.  Setup environment variables:
    ```bash
    cp .env.example .env
    ```
3.  Initialize the database:
    ```bash
    bunx drizzle-kit push
    ```

### Common Commands

**Development Server**
Start the dev server:
```bash
bun run dev
```
Start the dev server with network access (accessible from other devices):
```bash
bun run dev:host
```

**Database Management**
Update database schema (apply changes):
```bash
bunx drizzle-kit push
```
Open Drizzle Studio (database GUI):
```bash
bunx drizzle-kit studio
```
Generate migrations (if using migration flow):
```bash
bunx drizzle-kit generate
```

**Testing**
Run unit tests:
```bash
bun run test:unit
```
Run a single unit test file:
```bash
bun run test:unit src/lib/utils/array.spec.ts
```
Run E2E tests:
```bash
bun run test:e2e
```
Run all tests:
```bash
bun run test
```

Note: The project uses Vitest with two separate test environments:
- Client tests (`*.svelte.test.ts` or `*.svelte.spec.ts`): Run in jsdom environment for Svelte components
- Server tests (`*.test.ts` or `*.spec.ts`): Run in Node environment for server-side logic

E2E tests use Playwright and are located in the `e2e/` directory.

**Linting & Formatting**
Format code:
```bash
bun run format
```
Lint code:
```bash
bun run lint
```
Check types:
```bash
bun run check
```

**Building**
Build for production:
```bash
bun run build
```

### Docker
The project includes `Dockerfile` and `docker-compose.yml` for containerized deployment.
```bash
docker compose up -d
```
