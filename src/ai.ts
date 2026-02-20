import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

let client: Groq | null = null;

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

function getClient(): Groq {
  if (client) return client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY not found.\nAdd it to your .env file:\nGROQ_API_KEY=your_key_here\n\nOr test without it using: phantomit push --mock'
    );
  }
  client = new Groq({ apiKey });
  return client;
}

export async function generateCommitMessage(diff: string, mock = false): Promise<string> {
  // Mock mode — return a random realistic commit message  ahah
  if (mock) {
    await new Promise(r => setTimeout(r, 800)); // simulate network delay
    return MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];
  }

  if (!diff.trim()) return 'chore: minor updates';

  const truncated = diff.length > 6000 ? diff.slice(0, 6000) + '\n...(truncated)' : diff;

  const groq = getClient();

  const response = await groq.chat.completions.create({
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
