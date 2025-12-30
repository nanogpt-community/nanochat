import { ResultAsync } from 'neverthrow';
import type {
	GenerateFollowUpQuestionsRequestBody,
	GenerateFollowUpQuestionsResponse,
} from './+server';

export async function callGenerateFollowUpQuestions(
	args: GenerateFollowUpQuestionsRequestBody,
	{ signal }: { signal?: AbortSignal } = {}
) {
	const res = ResultAsync.fromPromise(
		(async () => {
			const res = await fetch('/api/generate-follow-up-questions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(args),
				signal,
			});

			if (!res.ok) {
				const { message } = await res.json();
				throw new Error(message as string);
			}

			return res.json() as Promise<GenerateFollowUpQuestionsResponse>;
		})(),
		(e) => `${e}`
	);

	return res;
}
