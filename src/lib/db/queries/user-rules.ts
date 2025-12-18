import { db, generateId } from '../index';
import { userRules, type UserRule, type NewUserRule } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getAllUserRules(userId: string): Promise<UserRule[]> {
    return db.query.userRules.findMany({
        where: eq(userRules.userId, userId),
    });
}

export async function getRulesByAttach(
    userId: string,
    attach: 'always' | 'manual'
): Promise<UserRule[]> {
    return db.query.userRules.findMany({
        where: and(eq(userRules.userId, userId), eq(userRules.attach, attach)),
    });
}

export async function createRule(
    userId: string,
    data: { name: string; attach: 'always' | 'manual'; rule: string }
): Promise<UserRule> {
    // Check if rule with same name exists
    const existing = await db.query.userRules.findFirst({
        where: and(eq(userRules.userId, userId), eq(userRules.name, data.name)),
    });

    if (existing) {
        throw new Error('Rule with this name already exists');
    }

    const now = new Date();
    const [result] = await db
        .insert(userRules)
        .values({
            id: generateId(),
            userId,
            name: data.name,
            attach: data.attach,
            rule: data.rule,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return result;
}

export async function updateRule(
    userId: string,
    ruleId: string,
    data: { attach?: 'always' | 'manual'; rule?: string }
): Promise<UserRule> {
    const existing = await db.query.userRules.findFirst({
        where: eq(userRules.id, ruleId),
    });

    if (!existing) throw new Error('Rule not found');
    if (existing.userId !== userId) throw new Error('You are not the owner of this rule');

    const [result] = await db
        .update(userRules)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(eq(userRules.id, ruleId))
        .returning();

    return result;
}

export async function renameRule(userId: string, ruleId: string, name: string): Promise<UserRule> {
    const existing = await db.query.userRules.findFirst({
        where: eq(userRules.id, ruleId),
    });

    if (!existing) throw new Error('Rule not found');
    if (existing.userId !== userId) throw new Error('You are not the owner of this rule');

    // Check if another rule with this name exists
    const duplicateName = await db.query.userRules.findFirst({
        where: and(eq(userRules.userId, userId), eq(userRules.name, name)),
    });

    if (duplicateName && duplicateName.id !== ruleId) {
        throw new Error('Rule with this name already exists');
    }

    const [result] = await db
        .update(userRules)
        .set({
            name,
            updatedAt: new Date(),
        })
        .where(eq(userRules.id, ruleId))
        .returning();

    return result;
}

export async function deleteRule(userId: string, ruleId: string): Promise<void> {
    const existing = await db.query.userRules.findFirst({
        where: eq(userRules.id, ruleId),
    });

    if (!existing) throw new Error('Rule not found');
    if (existing.userId !== userId) throw new Error('You are not the owner of this rule');

    await db.delete(userRules).where(eq(userRules.id, ruleId));
}
