import { db } from '$lib/db';
import { user } from '$lib/db/schema';
import { like, sql } from 'drizzle-orm';

export async function migrateEmailDomains() {
    try {
        console.log('Starting email domain migration...');

        // Find all users with equal @thom.chat emails
        const usersToUpdate = await db
            .select()
            .from(user)
            .where(like(user.email, '%@thom.chat'));

        console.log(`Found ${usersToUpdate.length} users to migrate.`);

        if (usersToUpdate.length === 0) {
            console.log('No users to migrate.');
            return;
        }

        // Update strictly @thom.chat to @nano.chat
        // We use a raw SQL query for efficiency if possible, or iterate
        // but simple iteration is safer for logic verification.
        // Actually, let's use a transaction to ensure valid updates.

        await db.transaction(async (tx) => {
            for (const u of usersToUpdate) {
                if (!u.email) continue;
                const newEmail = u.email.replace('@thom.chat', '@nano.chat');
                await tx.update(user)
                    .set({ email: newEmail })
                    .where(sql`${user.id} = ${u.id}`);
                console.log(`Migrated user ${u.id}: ${u.email} -> ${newEmail}`);
            }
        });

        console.log('Email domain migration completed successfully.');
    } catch (error) {
        console.error('Email domain migration failed:', error);
    }
}
