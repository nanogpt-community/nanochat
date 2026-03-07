const SECRET_PATTERNS: Array<[RegExp, string]> = [
	[/Authorization:\s*Bearer\s+[^\s"',}]+/gi, 'Authorization: Bearer [REDACTED]'],
	[/Bearer\s+(nc_[A-Za-z0-9_-]+)/g, 'Bearer [REDACTED]'],
	[/Bearer\s+(sk-[A-Za-z0-9_-]+)/g, 'Bearer [REDACTED]'],
	[/("x-api-key"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2'],
	[/(x-api-key\s*[:=]\s*)[^\s"',}]+/gi, '$1[REDACTED]'],
	[/("apiKey"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2'],
	[/("key"\s*:\s*")(nc_[^"]+)(")/g, '$1[REDACTED]$3'],
	[/(nc_[A-Za-z0-9]{16,})/g, '[REDACTED]'],
	[/(sk-[A-Za-z0-9_-]{16,})/g, '[REDACTED]'],
];

const MAX_LOG_TEXT_LENGTH = 500;

export function redactSecrets(value: string): string {
	let redacted = value;

	for (const [pattern, replacement] of SECRET_PATTERNS) {
		redacted = redacted.replace(pattern, replacement);
	}

	if (redacted.length > MAX_LOG_TEXT_LENGTH) {
		return `${redacted.slice(0, MAX_LOG_TEXT_LENGTH)}...`;
	}

	return redacted;
}

export async function readRedactedResponseText(response: Response): Promise<string> {
	try {
		return redactSecrets(await response.text());
	} catch {
		return '';
	}
}
