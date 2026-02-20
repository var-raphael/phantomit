import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import ignore, { Ignore } from 'ignore';
import { PhantomitConfig } from './config.js';

export interface FileEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  file: string;
}

type ChangeCallback = (events: FileEvent[]) => void;

function loadGitignore(cwd: string): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
}

export function startWatcher(
  cwd: string,
  config: PhantomitConfig,
  onChange: ChangeCallback
): () => void {
  const watchPaths = config.watch.map((w) => path.join(cwd, w));
  const eventQueue = new Map<string, FileEvent>(); // keyed by file path — dedupes
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = (config.debounce ?? 8) * 1000;

  const ig = loadGitignore(cwd);
  ig.add(config.ignore);

  const isIgnored = (filePath: string): boolean => {
    const relative = path.relative(cwd, filePath);
    if (!relative) return false;
    try { return ig.ignores(relative); } catch { return false; }
  };

  const watcher = chokidar.watch(watchPaths, {
    ignored: [/(^|[\/\\])\../],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const flush = () => {
    if (eventQueue.size === 0) return;
    const events = Array.from(eventQueue.values());
    eventQueue.clear();
    onChange(events);
  };

  const handleEvent = (type: FileEvent['type'], filePath: string) => {
    if (isIgnored(filePath)) return;
    const relative = path.relative(cwd, filePath);
    // If same file had multiple events, keep the latest
    eventQueue.set(relative, { type, file: relative });

    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(flush, debounceMs);
  };

  watcher.on('add',       (f) => handleEvent('add', f));
  watcher.on('change',    (f) => handleEvent('change', f));
  watcher.on('unlink',    (f) => handleEvent('unlink', f));
  watcher.on('addDir',    (f) => handleEvent('addDir', f));
  watcher.on('unlinkDir', (f) => handleEvent('unlinkDir', f));

  return () => {
    watcher.close();
    if (batchTimer) clearTimeout(batchTimer);
  };
}
