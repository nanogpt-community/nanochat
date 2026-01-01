// PDF text extraction utility
import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

export async function extractTextFromPDF(input: string | Buffer): Promise<string> {
	let filePath = typeof input === 'string' ? input : '';
	let tempFileActive = false;

	try {
		// If input is a buffer, write it to a temporary file
		if (Buffer.isBuffer(input)) {
			const tempFile = join(tmpdir(), `pdf-${randomUUID()}.pdf`);
			await writeFile(tempFile, input);
			filePath = tempFile;
			tempFileActive = true;
		}

		// Try using pdftotext (part of poppler-utils)
		try {
			const { stdout } = await execAsync(`pdftotext "${filePath}" -`, {
				encoding: 'utf8',
				maxBuffer: 10 * 1024 * 1024 // 10MB buffer
			});
			return stdout.trim();
		} catch (error) {
			console.warn('pdftotext not available or failed', error);
		}

		// Fallback: try using pdf-parse if available
		try {
			// @ts-ignore
			const pdfParseModule: any = await import('pdf-parse');
			const parse = pdfParseModule.default || pdfParseModule;

			const dataBuffer = Buffer.isBuffer(input) ? input : readFileSync(filePath);
			// @ts-ignore - PDFParse types might differ or be missing
			const data = await parse(dataBuffer);
			return data.text;
		} catch (error) {
			console.warn('pdf-parse extraction failed', error);
		}

		// If no extraction method works, return a placeholder
		return '[PDF content could not be extracted. The PDF has been stored and is available for download.]';

	} catch (error) {
		console.error('Failed to extract text from PDF:', error);
		return '[Error: Failed to extract PDF content]';
	} finally {
		// Clean up temp file if we created one
		if (tempFileActive && filePath) {
			try {
				await unlink(filePath);
			} catch (err) {
				console.warn('Failed to cleanup temp PDF file:', err);
			}
		}
	}
}