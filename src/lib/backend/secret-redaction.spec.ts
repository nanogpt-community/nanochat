import { describe, expect, it } from 'vitest';
import { redactSecrets } from './secret-redaction';

describe('redactSecrets', () => {
	it('redacts common bearer token formats', () => {
		const input =
			'Authorization: Bearer sk-ant-secretvalue1234567890 and Bearer hf_secretvalue1234567890';

		expect(redactSecrets(input)).toContain('Authorization: Bearer [REDACTED]');
		expect(redactSecrets(input)).not.toContain('sk-ant-secretvalue1234567890');
		expect(redactSecrets(input)).not.toContain('hf_secretvalue1234567890');
	});

	it('redacts secret-like JSON fields and query params', () => {
		const input =
			JSON.stringify({
				api_key: 'hf_secretvalue1234567890',
				accessToken: 'token-value-1234567890',
				refresh_token: 'refresh-value-1234567890',
			}) + '?api_key=hf_secretvalue1234567890';

		const output = redactSecrets(input);

		expect(output).not.toContain('hf_secretvalue1234567890');
		expect(output).not.toContain('token-value-1234567890');
		expect(output).not.toContain('refresh-value-1234567890');
		expect(output).toContain('"api_key":"[REDACTED]"');
		expect(output).toContain('"accessToken":"[REDACTED]"');
		expect(output).toContain('"refresh_token":"[REDACTED]"');
		expect(output).toContain('api_key=[REDACTED]');
	});
});
