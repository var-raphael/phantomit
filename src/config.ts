import fs from 'fs';
import path from 'path';

export type Mode = 'interval' | 'lines' | 'manual' | 'on-save';

export interface PhantomitConfig {
  mode: Mode;
  interval: number;
  lines: number;
  debounce: number;   // seconds to wait after last save before triggering
  autoPush: boolean;
  watch: string[];
  ignore: string[];
  branch: string;
}

const DEFAULTS: PhantomitConfig = {
  mode: 'interval',
  interval: 30,
  lines: 20,
  debounce: 8,
  autoPush: true,
  watch: ['src', 'app', 'lib', 'components', 'pages'],
  ignore: ['node_modules', '.next', 'dist', '.git', '*.log', '.env*'],
  branch: 'main',
};

export function loadConfig(cwd: string): PhantomitConfig {
  const configPath = path.join(cwd, '.phantomit.json');
  if (!fs.existsSync(configPath)) return DEFAULTS;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const user = JSON.parse(raw);
    return { ...DEFAULTS, ...user };
  } catch {
    console.warn('⚠ Could not parse .phantomit.json — using defaults.');
    return DEFAULTS;
  }
}

export function writeDefaultConfig(cwd: string): void {
  const configPath = path.join(cwd, '.phantomit.json');
  fs.writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2));
}
