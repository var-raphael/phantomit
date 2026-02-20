import fs from 'fs';
import path from 'path';

export type Mode = 'interval' | 'lines' | 'manual';

export interface PhantomitConfig {
  mode: Mode;
  interval: number;   // minutes — used when mode is 'interval'
  lines: number;      // lines changed threshold — used when mode is 'lines'
  autoPush: boolean;  // push after commit or just commit
  watch: string[];    // dirs/files to watch
  ignore: string[];   // patterns to ignore
  branch: string;     // branch to push to
}

const DEFAULTS: PhantomitConfig = {
  mode: 'interval',
  interval: 30,
  lines: 20,
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
