# API Key Encryption Migration

This guide explains how to encrypt all API keys in your database using AES-256-GCM encryption.

## Overview

The application now encrypts all API keys (both user-added provider keys and application-generated API keys) before storing them in the database. This provides an additional layer of security in case your database is compromised.

### What Gets Encrypted?

1. **User Provider Keys** (`user_keys` table): NanoGPT, OpenAI, Anthropic, and HuggingFace API keys that users add in their account settings
2. **Application API Keys** (`api_keys` table): Developer API keys generated for programmatic access (format: `nc_...`)

### Encryption Details

- **Algorithm**: AES-256-GCM (industry standard, widely supported, hardware accelerated)
- **Key Derivation**: scrypt with N=16384, r=8, p=1 (~64MB memory)
- **Key Source**: `ENCRYPTION_KEY` environment variable
- **Format**: VERSION | SALT | IV | ENCRYPTED_DATA | AUTH_TAG (base64-encoded)

## Prerequisites

1. **Backup your database** - This is critical!
   ```bash
   cp data/nanochat.db data/nanochat.db.backup
   ```

2. **Generate an encryption key** (if you haven't already):
   ```bash
   openssl rand -base64 32
   ```

3. **Set the ENCRYPTION_KEY environment variable** in your `.env` file:
   ```bash
   ENCRYPTION_KEY=your-generated-key-here
   ```

   ⚠️ **IMPORTANT**: Keep this key safe and never change it, or all encrypted API keys will be permanently lost!

## Migration Steps

### Option 1: Run the Migration Script (Recommended)

The migration script will encrypt all existing API keys in your database:

1. **Ensure the application is NOT being used** (stop the server)
2. **Set the ENCRYPTION_KEY** environment variable
3. **Run the migration script**:
   ```bash
   bun run scripts/migrate-encrypt-api-keys.ts
   ```

The script will:
- Show you all keys it's about to encrypt
- Wait 5 seconds (press Ctrl+C to cancel)
- Encrypt all unencrypted keys
- Skip keys that are already encrypted
- Show a summary when complete

### Backfill Developer API Key Lookup Hashes

If you want to upgrade all existing developer API keys to the current PBKDF2-based lookup hash immediately, run:

```bash
npm run db:backfill-api-key-hashes
```

To preview what would change without writing to the database:

```bash
bun run scripts/backfill-api-key-hashes.ts --dry-run
```

This script:
- Finds rows in `api_keys` with a missing or legacy `key_hash`
- Decrypts the stored key when needed
- Recomputes the current versioned lookup hash
- Updates the database in place

### Option 2: Let New Keys Be Encrypted (No Migration)

If you prefer not to encrypt existing keys:
- New keys will automatically be encrypted when added
- Existing unencrypted keys will continue to work (the app detects and handles both)
- You can run the migration script later if desired

### Option 3: Skip Encryption Entirely (Graceful Degradation)

The application supports running without encryption for compatibility:

- **Without `ENCRYPTION_KEY` set**: API keys are stored in plain text (like before)
- A warning is logged on startup: `⚠️ ENCRYPTION_KEY not set. API keys will be stored in plain text.`
- The application continues to work normally
- You can enable encryption later by setting `ENCRYPTION_KEY` and running the migration script

## Verification

After migration, you can verify encryption worked by checking the database:

```bash
# For SQLite
sqlite3 data/nanochat.db "SELECT key FROM user_keys LIMIT 5;"
sqlite3 data/nanochat.db "SELECT key FROM api_keys LIMIT 5;"
```

Encrypted keys will be long base64 strings (150+ characters), while unencrypted keys are shorter.

## How It Works

### Key Storage Flow

1. **When a user adds an API key**:
   - The key is received via the API
   - Immediately encrypted using `encryptApiKey()`
   - Stored in the database in encrypted form

2. **When an API key is needed**:
   - Retrieved from database (encrypted)
   - Decrypted using `decryptApiKey()`
   - Used for API calls
   - Never returned to the client (masked instead)

3. **For legacy unencrypted keys**:
   - The `isEncrypted()` helper detects encryption
   - Unencrypted keys are used as-is
   - This allows gradual migration

### Security Considerations

✅ **What encryption protects against**:
- Database dumps/file exposure
- SQL injection attacks that expose the database
- Backup database access

❌ **What encryption does NOT protect against**:
- Application server compromise (the key is in memory during use)
- Environment variable exposure on the server
- Process debugging/memory dumps

### Best Practices

1. **Never commit the ENCRYPTION_KEY to version control**
2. **Rotate the encryption key** (requires special handling - not yet implemented)
3. **Use strong environment variable security** in production
4. **Keep backups** before any migration
5. **Document the key location** for disaster recovery

## Troubleshooting

### "ENCRYPTION_KEY environment variable is not set"

**Solution**: Add the ENCRYPTION_KEY to your `.env` file:
```bash
ENCRYPTION_KEY=$(openssl rand -base64 32)
```

### "ENCRYPTION_KEY must be at least 32 characters"

**Solution**: Generate a longer key:
```bash
openssl rand -base64 32
```

### Keys stopped working after migration

**Solution**: This likely means the ENCRYPTION_KEY used during migration is different from the one the application is using. Either:
- Restore from backup and migrate again with the correct key
- Ensure the same ENCRYPTION_KEY is set in all environments

## Rollback

If you need to rollback:

1. Stop the application
2. Restore your database backup:
   ```bash
   cp data/nanochat.db.backup data/nanochat.db
   ```
3. Remove or comment out the `ENCRYPTION_KEY` from your `.env` file
4. Restart the application

Note: This will revert to storing API keys in plain text.
