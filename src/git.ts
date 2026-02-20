import simpleGit, { SimpleGit } from 'simple-git';

export function getGit(cwd: string): SimpleGit {
  return simpleGit(cwd);
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const git = getGit(cwd);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

export async function getStagedDiff(cwd: string): Promise<string> {
  const git = getGit(cwd);
  const diff = await git.diff(['--staged']);
  return diff;
}

export async function getUnstagedDiff(cwd: string): Promise<string> {
  const git = getGit(cwd);
  const diff = await git.diff();
  return diff;
}

export async function stageAll(cwd: string): Promise<void> {
  const git = getGit(cwd);
  await git.add('.');
}

export async function commit(cwd: string, message: string): Promise<void> {
  const git = getGit(cwd);
  await git.commit(message);
}

export async function push(cwd: string, branch: string): Promise<void> {
  const git = getGit(cwd);
  await git.push('origin', branch);
}

export async function hasChanges(cwd: string): Promise<boolean> {
  const git = getGit(cwd);
  const status = await git.status();
  return !status.isClean();
}

export async function countChangedLines(cwd: string): Promise<number> {
  const git = getGit(cwd);
  const diff = await git.diff(['--stat']);
  const match = diff.match(/(\d+) insertions?.*?(\d+) deletions?/);
  if (!match) {
    // just count from raw diff
    const raw = await git.diff();
    const lines = raw.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'));
    return lines.length;
  }
  return parseInt(match[1]) + parseInt(match[2]);
}
