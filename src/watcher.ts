import chokidar from 'chokidar';
import path from 'path';
import { PhantomitConfig } from './config.js';

type ChangeCallback = (changedFiles: string[]) => void;

export function startWatcher(
  cwd: string,
  config: PhantomitConfig,
  onChange: ChangeCallback
): () => void {
  const watchPaths = config.watch.map((w) => path.join(cwd, w));
  const changedFiles = new Set<string>();
  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(watchPaths, {
    ignored: [
      /(^|[\/\\])\../, // dotfiles
      ...config.ignore.map((p) => new RegExp(p.replace(/\*/g, '.*'))),
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
    changedFiles.add(relative);

    // Debounce — wait 2s of inactivity before triggering
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(flush, 2000);
  };

  watcher.on('change', handleChange);
  watcher.on('add', handleChange);
  watcher.on('unlink', handleChange);

  // Return cleanup function
  return () => {
    watcher.close();
    if (batchTimer) clearTimeout(batchTimer);
  };
}
