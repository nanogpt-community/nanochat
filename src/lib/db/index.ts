import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// Ensure data directory exists
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'thom-chat.db');
const sqlite = new Database(dbPath);

// Enable WAL mode for better performance
sqlite.exec('PRAGMA journal_mode = WAL;');

// Export the drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Export the raw sqlite instance for direct queries if needed
export { sqlite };

// Helper to generate UUIDs
export function generateId(): string {
    return crypto.randomUUID();
}
