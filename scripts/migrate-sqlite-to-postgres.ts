#!/usr/bin/env bun
/**
 * One-shot copy of an existing data/nanochat.db into Postgres.
 *
 * Run the Postgres migrations first, then:
 *   bun run db:migrate
 *   bun run scripts/migrate-sqlite-to-postgres.ts [path/to/nanochat.db]
 *
 * Self-check (no database needed):
 *   bun run scripts/migrate-sqlite-to-postgres.ts --self-check
 */

import 'dotenv/config';
// @ts-ignore - bun:sqlite is available at runtime
import { Database } from 'bun:sqlite';
import { join } from 'path';

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

// Seconds and milliseconds are told apart by magnitude: 1e11 seconds is the year
// 5138, 1e11 ms is 1973, so anything above the threshold is milliseconds. Rows
// written by better-auth land in ms even though drizzle's sqlite timestamp mode
// writes seconds, and a couple of tables hold ISO text. Unparseable values become
// null rather than aborting the whole migration with a Postgres range error.
export function toIso(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value.trim())) {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
	}
	const n = Number(value);
	if (!Number.isFinite(n) || n === 0) return null;
	const date = new Date(Math.abs(n) > 1e11 ? n : n * 1000);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// SQLite has no native booleans/dates/json — it stores 0/1, integers and TEXT.
// Postgres does, so each column is coerced by its Postgres type.
export function coerce(type: string | undefined, value: unknown): unknown {
	if (value === null || value === undefined) return null;
	if (type === 'boolean') return value === 1 || value === true || value === '1';
	// ISO strings rather than Date objects: postgres.js' bulk-insert helper infers
	// parameter types from the column list and mis-serializes Date there.
	if (type === 'timestamp with time zone') return toIso(value);
	// sqlite already stores json as TEXT; hand Postgres the raw string and let
	// it cast (client.json() hits the same bulk-insert typing problem as Date)
	if (type === 'jsonb') return typeof value === 'string' ? value : JSON.stringify(value);
	return value;
}

function selfCheck() {
	const eq = (actual: unknown, expected: unknown, label: string) => {
		if (actual !== expected) throw new Error(`${label}: got ${actual}, want ${expected}`);
	};
	const TS = 'timestamp with time zone';
	eq(toIso(1753000000), '2025-07-20T08:26:40.000Z', 'seconds');
	eq(toIso(1753000000000), '2025-07-20T08:26:40.000Z', 'milliseconds');
	eq(toIso('1753000000000'), '2025-07-20T08:26:40.000Z', 'numeric string');
	eq(toIso('2025-07-20T08:26:40.000Z'), '2025-07-20T08:26:40.000Z', 'iso text');
	eq(toIso(null), null, 'null');
	eq(toIso(0), null, 'zero');
	eq(toIso('not a date'), null, 'garbage');
	eq(toIso(1e18), null, 'out of range');
	eq(coerce('boolean', 1), true, 'bool 1');
	eq(coerce('boolean', 0), false, 'bool 0');
	eq(coerce(TS, null), null, 'null timestamp');
	eq(coerce('jsonb', '{"a":1}'), '{"a":1}', 'json passthrough');
	eq(coerce('text', 'hi'), 'hi', 'text passthrough');
	console.log('self-check passed');
}

async function main() {
	const { client } = await import('../src/lib/db/index.js');
	const sqlitePath = process.argv[2] ?? join(process.cwd(), 'data', 'nanochat.db');
	const sqlite = new Database(sqlitePath, { readonly: true });

	const pgTypes = await client<
		Array<{ table_name: string; column_name: string; data_type: string }>
	>`
		select table_name, column_name, data_type
		from information_schema.columns
		where table_schema = 'public'
	`;

	const typeOf = new Map<string, string>();
	for (const c of pgTypes) typeOf.set(`${c.table_name}.${c.column_name}`, c.data_type);

	// Tables the old sqlite database predates are skipped, not fatal.
	const present = new Set(
		(
			sqlite.query(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{
				name: string;
			}>
		).map((r) => r.name)
	);

	let total = 0;

	for (const table of TABLES) {
		if (!present.has(table)) {
			console.log(`${table}: not in the sqlite database, skipping`);
			continue;
		}

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
			Object.fromEntries(columns.map((c) => [c, coerce(typeOf.get(`${table}.${c}`), row[c])]))
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
}

if (process.argv.includes('--self-check')) selfCheck();
else await main();
