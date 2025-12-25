// EPUB text extraction utility
import EPub from 'epub2';
import * as htmlparser2 from 'htmlparser2';

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

/**
 * Extract text content from an EPUB file
 * @param filePath Path to the EPUB file
 * @returns Extracted text content from all chapters
 */
export async function extractTextFromEPUB(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
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

                // Extract text from each chapter
                for (const item of flow) {
                    const itemId = item.id;
                    if (!itemId) continue;

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
                                chapters.push(plainText);
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
}
