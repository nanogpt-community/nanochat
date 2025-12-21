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
-   `src/lib`: Shared utilities and code.
    -   `db`: Drizzle ORM schema (`schema.ts`), connection setup (`index.ts`), and queries (`queries/`).
    -   `backend`: Server-side logic replacing the original Convex backend.
    -   `components`: Reusable UI components (Melt UI, etc.).
    -   `spells`: AI-specific logic and tools.
    -   `actions`: Svelte actions.
    -   `state`: State management.

### Key Concepts
-   **Database**: Uses SQLite with Drizzle ORM. The database file is located at `./data/thom-chat.db` (configured in `drizzle.config.ts`).
-   **Authentication**: Handled by BetterAuth.
-   **AI Integration**: Connects to Nano-GPT (and potentially OpenRouter) for model inference.

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
Run E2E tests:
```bash
bun run test:e2e
```
Run all tests:
```bash
bun run test
```

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
