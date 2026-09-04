// EPUB text extraction utility
import EPub from 'epub2';
import AdmZip from 'adm-zip';
import * as htmlparser2 from 'htmlparser2';

// Expansion budget. epub2 reads whole entries into memory, so a zip bomb or a
// million-entry archive must be rejected from the central directory alone,
// before anything is inflated.
const MAX_ENTRIES = 2000;
const MAX_TOTAL_UNCOMPRESSED = 256 * 1024 * 1024;
const MAX_ENTRY_RATIO = 200;
const RATIO_CHECK_MIN_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 5_000_000;
const EPUB_TIMEOUT_MS = 60_000;

function assertSaneArchive(filePath: string): void {
    const entries = new AdmZip(filePath).getEntries();
    if (entries.length > MAX_ENTRIES) {
        throw new Error(`EPUB has too many entries (${entries.length})`);
    }
    let total = 0;
    for (const entry of entries) {
        const { size, compressedSize } = entry.header;
        total += size;
        if (total > MAX_TOTAL_UNCOMPRESSED) {
            throw new Error('EPUB expands beyond the allowed size');
        }
        if (size > RATIO_CHECK_MIN_BYTES && compressedSize > 0 && size / compressedSize > MAX_ENTRY_RATIO) {
            throw new Error(`EPUB entry ${entry.entryName} has an implausible compression ratio`);
        }
    }
}

/**
 * Extract plain text from HTML content by stripping all tags
 */
function stripHtml(html: string): string {
    let text = '';
    const parser = new htmlparser2.Parser({
        ontext(data: string) {
            text += data;
        },
    });
    parser.write(html);
    parser.end();
    return text.replace(/\s+/g, ' ').trim();
}

import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Extract text content from an EPUB file
 * @param input Path to the EPUB file or Buffer
 * @returns Extracted text content from all chapters
 */
export async function extractTextFromEPUB(input: string | Buffer): Promise<string> {
    let filePath = typeof input === 'string' ? input : '';
    let tempFileActive = false;

    try {
        // If input is a buffer, write it to a temporary file
        if (Buffer.isBuffer(input)) {
            const tempFile = join(tmpdir(), `epub-${randomUUID()}.epub`);
            await writeFile(tempFile, input);
            filePath = tempFile;
            tempFileActive = true;
        }

        assertSaneArchive(filePath);

        const parse = new Promise<string>((resolve, reject) => {
            const epub = new EPub(filePath);

            epub.on('error', (err: Error) => {
                console.error('EPUB parsing error:', err);
                reject(err);
            });

            epub.on('end', async () => {
                try {
                    const chapters: string[] = [];

                    // Get metadata
                    const title = epub.metadata?.title || 'Untitled';
                    const author = epub.metadata?.creator || 'Unknown Author';
                    chapters.push(`Title: ${title}`);
                    chapters.push(`Author: ${author}`);
                    chapters.push('');

                    // Get table of contents / spine
                    const flow = epub.flow || [];
                    let totalChars = 0;

                    // Extract text from each chapter
                    for (const item of flow) {
                        const itemId = item.id;
                        if (!itemId) continue;
                        if (totalChars >= MAX_TEXT_CHARS) {
                            chapters.push('[Remaining chapters omitted: extracted text limit reached]');
                            break;
                        }

                        try {
                            const chapterContent = await new Promise<string>((resolveChapter) => {
                                epub.getChapter(itemId, (error: Error, text?: string) => {
                                    if (error) {
                                        console.warn(`Failed to get chapter ${itemId}:`, error);
                                        resolveChapter('');
                                        return;
                                    }
                                    resolveChapter(text || '');
                                });
                            });

                            if (chapterContent) {
                                // Strip HTML tags and add the chapter text
                                const plainText = stripHtml(chapterContent);
                                if (plainText.length > 0) {
                                    // Add chapter title if available
                                    if (item.title) {
                                        chapters.push(`## ${item.title}`);
                                    }
                                    const room = MAX_TEXT_CHARS - totalChars;
                                    chapters.push(plainText.length > room ? plainText.slice(0, room) : plainText);
                                    totalChars += Math.min(plainText.length, room);
                                    chapters.push('');
                                }
                            }
                        } catch (chapterError) {
                            console.warn(`Error extracting chapter ${itemId}:`, chapterError);
                        }
                    }

                    const fullText = chapters.join('\n').trim();

                    if (fullText.length === 0) {
                        resolve('[EPUB content could not be extracted. The file may be empty or in an unsupported format.]');
                    } else {
                        resolve(fullText);
                    }
                } catch (extractError) {
                    console.error('Error during EPUB content extraction:', extractError);
                    reject(extractError);
                }
            });

            epub.parse();
        });

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('EPUB parsing timed out')), EPUB_TIMEOUT_MS);
        });
        try {
            return await Promise.race([parse, timeout]);
        } finally {
            clearTimeout(timer);
        }
    } finally {
        // Clean up temp file if we created one
        if (tempFileActive && filePath) {
            try {
                await unlink(filePath);
            } catch (err) {
                console.warn('Failed to cleanup temp EPUB file:', err);
            }
        }
    }
}
