import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import ignore, { Ignore } from 'ignore';
import { PhantomitConfig } from './config.js';

type ChangeCallback = (changedFiles: string[]) => void;

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
  const changedFiles = new Set<string>();
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceMs = (config.debounce ?? 8) * 1000;

  // Load gitignore properly
  const ig = loadGitignore(cwd);

  // Also add manual ignore patterns from config
  ig.add(config.ignore);

  const watcher = chokidar.watch(watchPaths, {
    ignored: [
      /(^|[\/\\])\.\./, // dotfiles
      (filePath: string) => {
        const relative = path.relative(cwd, filePath);
        if (!relative) return false;
        return ig.ignores(relative);
      },
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const flush = () => {
    if (changedFiles.size === 0) return;
    const files = Array.from(changedFiles);
    changedFiles.clear();
    onChange(files);
  };

  const handleChange = (filePath: string) => {
    const relative = path.relative(cwd, filePath);
    // Double check with ignore before adding
    if (ig.ignores(relative)) return;
    changedFiles.add(relative);

    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(flush, debounceMs);
  };

  watcher.on('change', handleChange);
  watcher.on('add', handleChange);
  watcher.on('unlink', handleChange);

  return () => {
    watcher.close();
    if (batchTimer) clearTimeout(batchTimer);
  };
}
