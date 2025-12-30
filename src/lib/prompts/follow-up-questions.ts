export const FOLLOW_UP_QUESTIONS_PROMPT = (userMessage: string, assistantMessage: string) => `
Based on the conversation exchange below, generate 2-3 relevant follow-up questions the user might want to ask.

User message: """${userMessage}"""
Assistant response: """${assistantMessage}"""

Requirements:
- Generate 2-3 follow-up questions (maximum 3)
- Each question should be 5-15 words
- Questions should be conversational and natural
- Questions should explore related topics, dig deeper, or clarify ambiguities
- Avoid repeating what was already covered in the response
- Return ONLY a valid JSON array of question strings
- No markdown, no code blocks, no quotes, no explanations
- Empty array [] if no relevant follow-up questions

Output format must be exactly:
["Question 1?", "Question 2?", "Question 3?"]
`;
