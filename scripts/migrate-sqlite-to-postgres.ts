#!/usr/bin/env bun
/**
 * One-shot copy of an existing data/nanochat.db into Postgres.
 *
 * Run the Postgres migrations first, then:
 *   bun run db:migrate
 *   bun run scripts/migrate-sqlite-to-postgres.ts [path/to/nanochat.db]
 */

import 'dotenv/config';
// @ts-ignore - bun:sqlite is available at runtime
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { client } from '../src/lib/db/index.js';

const sqlitePath = process.argv[2] ?? join(process.cwd(), 'data', 'nanochat.db');
const sqlite = new Database(sqlitePath, { readonly: true });

// Parent-before-child: every table is inserted after the tables it references.
const TABLES = [
	'user',
	'session',
	'account',
	'verification',
	'passkey',
	'ssoProvider',
	'user_settings',
	'user_keys',
	'user_enabled_models',
	'api_keys',
	'user_rules',
	'projects',
	'assistants',
	'conversations',
	'messages',
	'storage',
	'project_files',
	'project_members',
	'user_memories',
	'prompts',
	'scheduled_tasks',
	'message_ratings',
	'message_interactions',
	'model_performance_stats',
];

// SQLite has no native booleans/dates/json — it stores 0/1, unix seconds, and
// TEXT. Postgres does not, so each column is coerced by its Postgres type.
const pgTypes = await client<Array<{ table_name: string; column_name: string; data_type: string }>>`
	select table_name, column_name, data_type
	from information_schema.columns
	where table_schema = 'public'
`;

const typeOf = new Map<string, string>();
for (const c of pgTypes) typeOf.set(`${c.table_name}.${c.column_name}`, c.data_type);

function coerce(table: string, column: string, value: unknown): unknown {
	if (value === null || value === undefined) return null;
	const type = typeOf.get(`${table}.${column}`);

	if (type === 'boolean') return value === 1 || value === true || value === '1';
	// drizzle's sqlite timestamp mode stores unix seconds. ISO strings rather
	// than Date objects: postgres.js' bulk-insert helper infers parameter types
	// from the column list and mis-serializes Date there.
	if (type === 'timestamp with time zone') return new Date(Number(value) * 1000).toISOString();
	// sqlite already stores json as TEXT; hand Postgres the raw string and let
	// it cast (client.json() hits the same bulk-insert typing problem as Date)
	if (type === 'jsonb') return typeof value === 'string' ? value : JSON.stringify(value);
	return value;
}

let total = 0;

for (const table of TABLES) {
	const rows = sqlite.query(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
	if (rows.length === 0) {
		console.log(`${table}: empty`);
		continue;
	}

	const columns = Object.keys(rows[0]).filter((c) => typeOf.has(`${table}.${c}`));
	const dropped = Object.keys(rows[0]).filter((c) => !typeOf.has(`${table}.${c}`));
	if (dropped.length > 0) {
		console.warn(
			`${table}: dropping columns absent from the Postgres schema: ${dropped.join(', ')}`
		);
	}

	const payload = rows.map((row) =>
		Object.fromEntries(columns.map((c) => [c, coerce(table, c, row[c])]))
	);

	// ponytail: 500-row chunks keep the bind-parameter count under Postgres'
	// 65535 limit on the widest table (user_settings, 25 columns).
	for (let i = 0; i < payload.length; i += 500) {
		const chunk = payload.slice(i, i + 500);
		await client`insert into ${client(table)} ${client(chunk, columns)} on conflict do nothing`;
	}

	console.log(`${table}: ${rows.length} rows`);
	total += rows.length;
}

console.log(`\nCopied ${total} rows. Verify the app, then archive ${sqlitePath}.`);

sqlite.close();
await client.end();
