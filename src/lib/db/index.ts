import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error(
		'DATABASE_URL is required, e.g. postgres://nanochat:nanochat@localhost:5432/nanochat'
	);
}

// ponytail: default pool size (10); tune max: if a bigger deployment needs it
export const client = postgres(connectionString);

// Export the drizzle instance with schema
export const db = drizzle(client, { schema });

// Helper to generate UUIDs
export function generateId(): string {
	return crypto.randomUUID();
}
