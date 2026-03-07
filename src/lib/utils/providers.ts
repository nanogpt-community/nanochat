
import { Result, ResultAsync } from 'neverthrow';

export type NanoGPTConnectionData = {
	balance: {
		usd: string;
		nano: string;
		depositAddress?: string;
	};
	subscription: {
		active: boolean;
		weeklyInputTokens: {
			used: number;
			remaining: number;
			limit: number;
			resetAt: number;
		};
		dailyImages: {
			used: number;
			remaining: number;
			limit: number;
			resetAt: number;
		};
	};
};

export const NanoGPT = {
	getApiKey: async (): Promise<Result<NanoGPTConnectionData, string>> => {
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
						weeklyInputTokens: {
							used: usageData.weeklyInputTokens?.used ?? 0,
							remaining: usageData.weeklyInputTokens?.remaining ?? 0,
							limit: usageData.limits?.weeklyInputTokens ?? 60_000_000,
							resetAt: usageData.weeklyInputTokens?.resetAt
						},
						dailyImages: {
							used: usageData.dailyImages?.used ?? 0,
							remaining: usageData.dailyImages?.remaining ?? 0,
							limit: usageData.limits?.dailyImages ?? 100,
							resetAt: usageData.dailyImages?.resetAt
						}
					}
				} as NanoGPTConnectionData;
			})(),
			(e) => `Failed to get API key info: ${e}`
		);
	},
};
