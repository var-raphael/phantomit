import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const MOCK_MESSAGES = [
  'feat(auth): add JWT token validation middleware',
  'fix(api): resolve null pointer in user fetch handler',
  'refactor(db): simplify PostgreSQL connection pooling logic',
  'chore(deps): update typescript and eslint to latest versions',
  'feat(ui): implement responsive navbar with mobile drawer',
  'fix(config): correct env variable parsing for production build',
  'perf(query): optimize slow JOIN on orders table with index',
  'docs(readme): update installation and usage instructions',
];

// Collect all available keys — supports unlimited GROQ_API_KEY_* pattern
function getApiKeys(): string[] {
  const keys: string[] = [];

  // Single key
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);

  // Any GROQ_API_KEY_* — _1, _2, _10, _100, no limit
  Object.entries(process.env).forEach(([key, value]) => {
    if (key.startsWith('GROQ_API_KEY_') && value) keys.push(value);
  });

  return [...new Set(keys)]; // dedupe
}

function getRandomKey(): string {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error(
      'No GROQ API key found.\nAdd at least one to your .env file:\n\nGROQ_API_KEY=your_key\n\nOr add multiple for rotation:\nGROQ_API_KEY_1=key_one\nGROQ_API_KEY_2=key_two\n...\n\nGet a free key at: https://console.groq.com'
    );
  }
  return keys[Math.floor(Math.random() * keys.length)]!;
}

export async function generateCommitMessage(diff: string, mock = false): Promise<string> {
  if (mock) {
    await new Promise(r => setTimeout(r, 800));
    return MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)]!;
  }

  if (!diff.trim()) return 'chore: minor updates';

  const truncated = diff.length > 6000 ? diff.slice(0, 6000) + '\n...(truncated)' : diff;

  const client = new Groq({ apiKey: getRandomKey() });

  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 60,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: `You are a Git commit message generator.
Your job is to analyze a code diff and produce a single, professional commit message.

Rules:
- Use conventional commits format: type(scope): description
- Types: feat, fix, refactor, chore, docs, style, test, perf
- Keep it between 10-20 words
- Be specific and descriptive, not vague
- No period at the end
- Output ONLY the commit message, nothing else — no explanation, no quotes`,
      },
      {
        role: 'user',
        content: `Generate a commit message for this diff:\n\n${truncated}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? 'chore: update code';
}
