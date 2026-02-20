#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, writeDefaultConfig } from './config.js';
import { startWatcher } from './watcher.js';
import { generateCommitMessage } from './ai.js';
import {
  hasChanges, stageAll, getStagedDiff, getUnstagedDiff,
  commit, push, isGitRepo, countChangedLines,
} from './git.js';

const cwd = process.cwd();
const args = process.argv.slice(2);
const command = args[0];

const DAEMON_PID_FILE = path.join(cwd, '.phantomit.pid');
const DAEMON_LOG_FILE = path.join(cwd, '.phantomit.log');

// ── Parse flags ───────────────────────────────────────────────────────────────
function parseFlags(args: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--daemon') { flags.daemon = true; continue; }
    if (arg === '--on-save') { flags.mode = 'on-save'; continue; }
    if (arg === '--manual') { flags.mode = 'manual'; continue; }
    if (arg === '--every' && args[i + 1]) { flags.mode = 'interval'; flags.interval = args[++i]; continue; }
    if (arg === '--lines' && args[i + 1]) { flags.mode = 'lines'; flags.lines = args[++i]; continue; }
  }
  return flags;
}

// ── Banner ────────────────────────────────────────────────────────────────────
function banner() {
  console.log(chalk.magenta(`
  ██████╗ ██╗  ██╗ █████╗ ███╗   ██╗████████╗ ██████╗ ███╗   ███╗██╗████████╗
  ██╔══██╗██║  ██║██╔══██╗████╗  ██║╚══██╔══╝██╔═══██╗████╗ ████║██║╚══██╔══╝
  ██████╔╝███████║███████║██╔██╗ ██║   ██║   ██║   ██║██╔████╔██║██║   ██║   
  ██╔═══╝ ██╔══██║██╔══██║██║╚██╗██║   ██║   ██║   ██║██║╚██╔╝██║██║   ██║   
  ██║     ██║  ██║██║  ██║██║ ╚████║   ██║   ╚██████╔╝██║ ╚═╝ ██║██║   ██║   
  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝   ╚═╝   
  `));
  console.log(chalk.dim('  AI-powered git commits by ') + chalk.magenta('var-raphael') + '\n');
}

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ── Core commit flow ──────────────────────────────────────────────────────────
async function runCommitFlow(silent = false, mock = false): Promise<boolean> {
  const config = loadConfig(cwd);

  const changed = await hasChanges(cwd);
  if (!changed) {
    if (!silent) console.log(chalk.dim('  nothing to commit, working tree clean'));
    return false;
  }

  await stageAll(cwd);

  let diff = await getStagedDiff(cwd);
  if (!diff) diff = await getUnstagedDiff(cwd);
  if (!diff.trim()) return false;

  // Daemon mode — no interactive prompt
  if (silent) {
    let message: string;
    try {
      message = await generateCommitMessage(diff, mock);
    } catch (err: any) {
      fs.appendFileSync(DAEMON_LOG_FILE, `[${new Date().toISOString()}] AI error: ${err.message}\n`);
      return false;
    }
    try {
      await commit(cwd, message);
      if (config.autoPush) await push(cwd, config.branch);
      fs.appendFileSync(DAEMON_LOG_FILE, `[${new Date().toISOString()}] committed: ${message}\n`);
    } catch (err: any) {
      fs.appendFileSync(DAEMON_LOG_FILE, `[${new Date().toISOString()}] error: ${err.message}\n`);
    }
    return true;
  }

  // Interactive mode
  const spinner = ora({ text: chalk.dim('generating commit message...'), color: 'magenta' }).start();
  let message: string;
  try {
    message = await generateCommitMessage(diff, mock);
    spinner.stop();
  } catch (err: any) {
    spinner.stop();
    console.log(chalk.red('  ✗ AI error: ') + err.message);
    return false;
  }

  console.log('\n' + chalk.magenta('  ✦ ') + chalk.white('Commit message:'));
  console.log(chalk.cyan(`  "${message}"`) + '\n');
  console.log(chalk.dim('  [Y] commit & push   [E] edit message   [N] skip\n'));

  const answer = await prompt(chalk.magenta('  → '));
  const choice = answer.toLowerCase();

  if (choice === 'n' || choice === 'no') {
    console.log(chalk.dim('  skipped.\n'));
    return false;
  }

  let finalMessage = message;
  if (choice === 'e' || choice === 'edit') {
    const edited = await prompt(chalk.white('  Edit message: '));
    if (edited.trim()) finalMessage = edited.trim();
  }

  const commitSpinner = ora({ text: chalk.dim('committing...'), color: 'magenta' }).start();
  try {
    await commit(cwd, finalMessage);
    commitSpinner.succeed(chalk.green('  committed: ') + chalk.white(finalMessage));
  } catch (err: any) {
    commitSpinner.fail(chalk.red('  commit failed: ' + err.message));
    return false;
  }

  if (config.autoPush) {
    const pushSpinner = ora({ text: chalk.dim('pushing...'), color: 'magenta' }).start();
    try {
      await push(cwd, config.branch);
      pushSpinner.succeed(chalk.green(`  pushed to origin/${config.branch}`));
    } catch (err: any) {
      pushSpinner.fail(chalk.red('  push failed: ' + err.message));
    }
  }

  console.log();
  return true;
}

// ── Daemon helpers ────────────────────────────────────────────────────────────
function isDaemonRunning(): number | null {
  if (!fs.existsSync(DAEMON_PID_FILE)) return null;
  const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim());
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.unlinkSync(DAEMON_PID_FILE);
    return null;
  }
}

function spawnDaemon(watchArgs: string[]) {
  const child = spawn(process.execPath, [process.argv[1], 'watch', ...watchArgs, '--daemon-child'], {
    detached: true,
    stdio: ['ignore', fs.openSync(DAEMON_LOG_FILE, 'a'), fs.openSync(DAEMON_LOG_FILE, 'a')],
    cwd,
  });
  child.unref();
  fs.writeFileSync(DAEMON_PID_FILE, String(child.pid));
  return child.pid;
}

// ── Watch logic ───────────────────────────────────────────────────────────────
async function runWatch(flags: Record<string, string | boolean>, silent = false) {
  const config = loadConfig(cwd);

  const mode = (flags.mode as string) || config.mode;
  const interval = flags.interval ? parseInt(flags.interval as string) : config.interval;
  const lines = flags.lines ? parseInt(flags.lines as string) : config.lines;

  if (!silent) {
    const modeLabel =
      mode === 'interval' ? `every ${interval} min` :
      mode === 'lines'    ? `every ${lines} lines changed` :
      mode === 'on-save'  ? 'on save (2s debounce)' : 'manual';
    console.log(chalk.magenta(`  mode: ${mode}`) + chalk.dim(` — ${modeLabel}`));
    console.log(chalk.dim(`  watching: ${config.watch.join(', ')}`));
    console.log(chalk.dim('  press Ctrl+C to stop\n'));
  }

  let isCommitting = false;

  if (mode === 'interval') {
    setInterval(async () => {
      if (isCommitting) return;
      isCommitting = true;
      if (await hasChanges(cwd)) {
        if (!silent) console.log(chalk.dim(`\n  [${new Date().toLocaleTimeString()}] interval triggered`));
        await runCommitFlow(silent);
      }
      isCommitting = false;
    }, interval * 60 * 1000);

  } else if (mode === 'lines') {
    const cleanup = startWatcher(cwd, config, async () => {
      if (isCommitting) return;
      const lineCount = await countChangedLines(cwd);
      if (lineCount >= lines) {
        isCommitting = true;
        if (!silent) console.log(chalk.dim(`\n  [${new Date().toLocaleTimeString()}] ${lineCount} lines changed`));
        await runCommitFlow(silent);
        isCommitting = false;
      }
    });
    process.on('SIGINT', () => { cleanup(); process.exit(0); });

  } else if (mode === 'on-save') {
    const cleanup = startWatcher(cwd, config, async (files) => {
      if (isCommitting) return;
      isCommitting = true;
      if (!silent) console.log(chalk.dim(`\n  [${new Date().toLocaleTimeString()}] saved: ${files.slice(0, 2).join(', ')}${files.length > 2 ? '...' : ''}`));
      await runCommitFlow(silent);
      isCommitting = false;
    });
    process.on('SIGINT', () => { cleanup(); process.exit(0); });

  } else {
    if (!silent) console.log(chalk.dim('  manual mode — run ') + chalk.white('phantomit push') + chalk.dim(' anytime'));
  }
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdInit() {
  banner();
  if (!(await isGitRepo(cwd))) {
    console.log(chalk.red('  ✗ not a git repository. Run git init first.'));
    process.exit(1);
  }
  writeDefaultConfig(cwd);
  console.log(chalk.green('  ✓ .phantomit.json created'));
  console.log(chalk.green('  ✓ add GROQ_API_KEY=your_key to your .env\n'));
  console.log(chalk.dim('  then run:'));
  console.log('  ' + chalk.white('phantomit watch --every 30'));
  console.log('  ' + chalk.white('phantomit watch --on-save'));
  console.log('  ' + chalk.white('phantomit watch --on-save --daemon') + chalk.dim(' (background)'));
  console.log();
}

async function cmdPush() {
  const mock = args.includes("--mock");
  if (!(await isGitRepo(cwd))) {
    console.log(chalk.red('  ✗ not a git repository.'));
    process.exit(1);
  }
  await runCommitFlow(false, mock);
}

async function cmdWatch() {
  const watchArgs = args.slice(1);
  const flags = parseFlags(watchArgs);

  if (!(await isGitRepo(cwd))) {
    console.log(chalk.red('  ✗ not a git repository.'));
    process.exit(1);
  }

  // Running as daemon child
  if (watchArgs.includes('--daemon-child')) {
    await runWatch(flags, true);
    return;
  }

  // Spawn daemon
  if (flags.daemon) {
    const existing = isDaemonRunning();
    if (existing) {
      console.log(chalk.yellow(`  ✦ phantomit already running (pid ${existing})`));
      console.log(chalk.dim('  run phantomit stop first'));
      return;
    }
    const pid = spawnDaemon(watchArgs.filter(a => a !== '--daemon'));
    const config = loadConfig(cwd);
    const mode = (flags.mode as string) || config.mode;
    const label =
      mode === 'interval' ? `every ${flags.interval || config.interval} min` :
      mode === 'lines'    ? `every ${flags.lines || config.lines} lines` :
      mode === 'on-save'  ? 'on save' : 'manual';
    console.log(chalk.green(`  ✓ phantomit daemon started (pid ${pid})`));
    console.log(chalk.dim(`  mode: ${mode} — ${label}`));
    console.log(chalk.dim(`  logs: phantomit status`));
    console.log(chalk.dim('  stop: phantomit stop\n'));
    return;
  }

  // Foreground
  banner();
  await runWatch(flags, false);
}

async function cmdStop() {
  const pid = isDaemonRunning();
  if (!pid) {
    console.log(chalk.dim('  no phantomit daemon running'));
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(DAEMON_PID_FILE);
    console.log(chalk.green(`  ✓ phantomit stopped (pid ${pid})`));
  } catch {
    console.log(chalk.red('  ✗ could not stop process'));
  }
}

async function cmdStatus() {
  const pid = isDaemonRunning();
  if (!pid) {
    console.log(chalk.dim('\n  ● phantomit is not running'));
  } else {
    console.log(chalk.green(`\n  ● phantomit is running`) + chalk.dim(` (pid ${pid})`));
  }
  if (fs.existsSync(DAEMON_LOG_FILE)) {
    const logs = fs.readFileSync(DAEMON_LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const last = logs.slice(-5);
    if (last.length) {
      console.log(chalk.dim('\n  recent activity:'));
      last.forEach(l => console.log(chalk.dim('  ' + l)));
    }
  }
  console.log();
}

// ── Router ────────────────────────────────────────────────────────────────────
async function main() {
  switch (command) {
    case 'init':   await cmdInit();   break;
    case 'push':   await cmdPush();   break;
    case 'watch':  await cmdWatch();  break;
    case 'stop':   await cmdStop();   break;
    case 'status': await cmdStatus(); break;
    default:
      banner();
      console.log(chalk.white('  Usage:\n'));
      console.log('  ' + chalk.magenta('phantomit init') +                    chalk.dim('                     — setup config in current project'));
      console.log('  ' + chalk.magenta('phantomit watch --every 30') +        chalk.dim('         — commit every 30 minutes'));
      console.log('  ' + chalk.magenta('phantomit watch --lines 20') +        chalk.dim('         — commit every 20 lines changed'));
      console.log('  ' + chalk.magenta('phantomit watch --on-save') +         chalk.dim('          — commit 2s after each save'));
      console.log('  ' + chalk.magenta('phantomit watch --on-save --daemon') + chalk.dim(' — run silently in background'));
      console.log('  ' + chalk.magenta('phantomit push') +                    chalk.dim('                     — manual one-shot commit'));
      console.log('  ' + chalk.magenta('phantomit stop') +                    chalk.dim('                     — stop background daemon'));
      console.log('  ' + chalk.magenta('phantomit status') +                  chalk.dim('                   — check daemon + recent activity'));
      console.log();
  }
}

main().catch((err) => {
  console.error(chalk.red('  fatal: ' + err.message));
  process.exit(1);
});
