# phantomit

> AI-powered git commits. Watches your code, diffs your changes, generates professional commit messages via Groq — so your GitHub graph stays green while you stay focused.

Built by [var-raphael](https://github.com/var-raphael).

---

## Why

You write code every day but forget to push. Your GitHub graph looks empty. Your commits when you do push are lazy — "fix stuff", "update", "changes". Phantomit solves all three.

It watches your project silently in the background, batches your file changes, sends the diff to Groq AI, and generates a clean conventional commit message. You approve it, it pushes. Done.

---

## Install

```bash
npm install -g phantomit
```

---

## Quick Start

```bash
# 1. Go into any git project
cd your-project

# 2. Setup phantomit
phantomit init

# 3. Add your Groq API key to .env
echo "GROQ_API_KEY=your_key_here" >> .env

# 4. Start watching
phantomit watch --on-save --daemon
```

Get a free Groq API key at [console.groq.com](https://console.groq.com) — no credit card required.

---

## Commands

| Command | Description |
|---|---|
| `phantomit init` | Create `.phantomit.json` config in current project |
| `phantomit watch --every 30` | Auto commit every 30 minutes if there are changes |
| `phantomit watch --lines 20` | Auto commit when 20+ lines have changed |
| `phantomit watch --on-save` | Commit 8 seconds after your last file save |
| `phantomit watch --on-save --daemon` | Same but runs silently in the background |
| `phantomit push` | Manually trigger a commit right now |
| `phantomit stop` | Stop the background daemon |
| `phantomit status` | Check if daemon is running + recent activity |

---

## Watch Modes

### `--every <minutes>`
Triggers a commit on a fixed interval if there are uncommitted changes. Best for devs who want fully automatic, hands-off commits.

```bash
phantomit watch --every 30        # every 30 minutes
phantomit watch --every 10        # every 10 minutes
```

### `--lines <count>`
Triggers a commit when the accumulated diff crosses a line threshold. Best for devs who write in focused bursts.

```bash
phantomit watch --lines 20        # commit every 20 lines changed
phantomit watch --lines 50        # commit every 50 lines changed
```

### `--on-save`
Triggers a commit 8 seconds after your last file save. All saves within that window are batched into one commit. Best for active coding sessions.

```bash
phantomit watch --on-save         # foreground — shows prompts in terminal
phantomit watch --on-save --daemon # background — silent, logs to .phantomit.log
```

### `--manual`
Watcher runs but never auto-commits. You trigger commits yourself with `phantomit push`.

```bash
phantomit watch --manual
# then whenever you're ready:
phantomit push
```

---

## The Commit Prompt

When a commit is triggered in foreground mode, you'll see:

```
  ✦ Commit message:
  "feat(auth): add JWT token validation to middleware layer"

  [Y] commit & push   [E] edit message   [N] skip

  →
```

- **Y** — commit and push as-is
- **E** — edit the message before committing
- **N** — skip this commit entirely

In daemon mode (`--daemon`), commits happen automatically without prompts and are logged to `.phantomit.log`.

---

## Configuration

Running `phantomit init` creates a `.phantomit.json` in your project root:

```json
{
  "mode": "interval",
  "interval": 30,
  "lines": 20,
  "debounce": 8,
  "autoPush": true,
  "watch": ["."],
  "ignore": ["node_modules", ".git"],
  "branch": "main"
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | string | `interval` | Default watch mode (`interval`, `lines`, `on-save`, `manual`) |
| `interval` | number | `30` | Minutes between commits in interval mode |
| `lines` | number | `20` | Line threshold for lines mode |
| `debounce` | number | `8` | Seconds to wait after last save before triggering (on-save mode) |
| `autoPush` | boolean | `true` | Push to remote after committing |
| `watch` | array | `["."]` | Folders/files to watch |
| `ignore` | array | `[...]` | Extra patterns to ignore (merged with `.gitignore`) |
| `branch` | string | `"main"` | Branch to push to |

CLI flags always override config file values.

---

## API Key Setup

Phantomit reads your Groq API key from `.env`. It supports multiple keys for automatic rotation — useful for spreading rate limits across accounts.

```env
# Single key — works fine
GROQ_API_KEY=your_key

# Multiple keys — phantomit picks one at random per commit
GROQ_API_KEY_1=first_key
GROQ_API_KEY_2=second_key
GROQ_API_KEY_3=third_key
# ...add as many as you want, no limit
```

Get free keys at [console.groq.com](https://console.groq.com).

---

## Testing Without a Groq Key

Use `--mock` to test the full flow with a fake AI response:

```bash
phantomit push --mock
```

This simulates the AI response with a realistic commit message so you can verify the setup works before adding a real key.

---

## How It Works

1. Phantomit watches your specified directories using `chokidar`
2. On trigger (save/interval/lines), it runs `git add .` then `git diff --staged`
3. The diff is sent to Groq's `llama-3.1-8b-instant` model with a strict prompt
4. The AI returns a conventional commit message (10-20 words)
5. You approve, edit, or skip — then it commits and pushes

Your `.gitignore` is automatically respected — phantomit reads it and excludes those paths from watching.

---

## License

MIT — free forever.
