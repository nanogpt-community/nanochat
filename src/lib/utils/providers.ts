import { Result, ResultAsync } from 'neverthrow';

export type NanoGPTApiKeyData = {
	label: string;
	usage: number;
	is_free_tier: boolean;
	is_provisioning_key: boolean;
	limit: number;
	limit_remaining: number;
};

export const NanoGPT = {
	getApiKey: async (key: string): Promise<Result<NanoGPTApiKeyData, string>> => {
		return await ResultAsync.fromPromise(
			(async () => {
				// Verify key by fetching models
				const res = await fetch('https://nano-gpt.com/api/v1/models', {
					headers: {
						Authorization: `Bearer ${key}`,
						'Content-Type': 'application/json',
					},
				});

				if (!res.ok) throw new Error('Failed to verify API key');

				// Start with dummy data since we don't have a dedicated key info endpoint yet
				return {
					label: 'NanoGPT Key',
					usage: 0,
					is_free_tier: false,
					is_provisioning_key: false,
					limit: 0,
					limit_remaining: 0,
				} as NanoGPTApiKeyData;
			})(),
			(e) => `Failed to get API key ${e}`
		);
	},
};
