<div align="center">
  <h1>thom.chat</h1>
  <p><em>Open-source self-hostable T3 Chat.</em></p>
  <img src="image.png">
</div>

---

## Changes with this fork

- Removed Convex -> Using SQLite instead
- Added Dockerfile/Docker Compose
- Yarn -> Bun
- Openrouter -> Nano-GPT (nano-gpt.com)
- Theme more closely resembles T3 Chat
- Nano-GPT Web Search / Deep Search
- Nano-GPT Web Scraping when you enter a URL (adds to context)
- Nano-GPT Context Memory (Single Chat)
- Cross-Conversation Memory (All Chats)
- Nano-GPT Image Generation + img2img support
- Passkey support (requires HTTPS)
- Nano-GPT Video Generation
- Assistants - Selectable System Prompts

## Setup (Docker)

### Installation

* Clone the repository ```git clone https://github.com/0xgingi/thom-chat.git```
* ```cd thom-chat```
* ```cp .env.example .env```
* Edit the .env file with your configuration
* ```docker compose up --build```

## Setup (Bun)

### Installation

* Install Bun (https://bun.sh/)
* Clone the repository ```git clone https://github.com/0xgingi/thom-chat.git```
* ```cd thom-chat```
* ```cp .env.example .env```
* Edit the .env file with your configuration
* ```bun install```
* ```bun run dev```
* run ```npx drizzle-kit push``` to upgrade your database schema when new features are added!