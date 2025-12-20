
import { Result, ResultAsync, ok, err } from 'neverthrow';

export type NanoGPTConnectionData = {
	balance: {
		usd: string;
		nano: string;
		depositAddress?: string;
	};
	subscription: {
		active: boolean;
		daily: {
			used: number;
			remaining: number;
			limit: number;
			resetAt: number;
		};
		monthly: {
			used: number;
			remaining: number;
			limit: number;
			resetAt: number;
		};
	};
	/* Legacy fields for compatibility if needed, though we'll update the UI */
	usage?: number;
	limit_remaining?: number;
};

export const NanoGPT = {
	getApiKey: async (_key: string): Promise<Result<NanoGPTConnectionData, string>> => {
		return await ResultAsync.fromPromise(
			(async () => {
				const [balanceRes, usageRes] = await Promise.all([
					fetch('/api/nano-gpt/balance', { method: 'POST' }),
					fetch('/api/nano-gpt/subscription-usage', { method: 'GET' })
				]);

				if (!balanceRes.ok || !usageRes.ok) {
					throw new Error('Failed to fetch NanoGPT account data');
				}

				const balanceData = await balanceRes.json();
				const usageData = await usageRes.json();

				return {
					balance: {
						usd: balanceData.usd_balance,
						nano: balanceData.nano_balance,
						depositAddress: balanceData.nanoDepositAddress
					},
					subscription: {
						active: usageData.active,
						daily: {
							used: usageData.daily?.used ?? 0,
							remaining: usageData.daily?.remaining ?? 0,
							limit: usageData.limits?.daily ?? 0,
							resetAt: usageData.daily?.resetAt
						},
						monthly: {
							used: usageData.monthly?.used ?? 0,
							remaining: usageData.monthly?.remaining ?? 0,
							limit: usageData.limits?.monthly ?? 0,
							resetAt: usageData.monthly?.resetAt
						}
					},
					// Map to 'usage' roughly as currently used daily? Or maybe just ignore legacy fields
					usage: usageData.daily?.used ?? 0,
					limit_remaining: usageData.daily?.remaining ?? 0
				} as NanoGPTConnectionData;
			})(),
			(e) => `Failed to get API key info: ${e}`
		);
	},
};
