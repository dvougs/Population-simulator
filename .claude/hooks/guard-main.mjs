#!/usr/bin/env node
// PreToolUse guardrail: code reaches main only through pull requests the owner merges.
// A push to main is allowed only when every file it changes is under project/.
// Merging pull requests is always blocked. Anything this script cannot verify is blocked.
//
// Input: the hook JSON on stdin ({ tool_name, tool_input, cwd }).
// Output: exit 0 to allow; exit 2 with a reason on stderr to block.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ALLOWED_PREFIX = 'project/';
const MAIN = 'main';

/**
 * Splits a shell command into simple commands, then each into words. Quotes are dropped rather
 * than honoured so `bash -c 'git push origin main'` is still seen as a push: erring towards
 * checking too much is safe, missing a push is not.
 */
export function splitCommands(command) {
  return command
    .replace(/["'`]/g, ' ')
    .split(/&&|\|\||[;|\n()]/)
    .map((part) => part.split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);
}

/** Strips a leading `+` and `refs/heads/` so `+refs/heads/main` and `main` compare equal. */
const branchName = (ref) => ref.replace(/^\+/, '').replace(/^refs\/heads\//, '');

/**
 * Parses one `git ... push ...` word list. Returns null when it is not a push, otherwise
 * { gitArgs, remote, refspecs, force, del, all } where gitArgs are options before `push` (e.g. -C dir).
 */
export function parsePush(words) {
  const gitAt = words.findIndex((w) => w === 'git' || w.endsWith('/git'));
  if (gitAt < 0) return null;
  const gitArgs = [];
  let i = gitAt + 1;
  while (i < words.length && words[i].startsWith('-')) {
    gitArgs.push(words[i]);
    if (words[i] === '-C' || words[i] === '-c') gitArgs.push(words[++i]);
    i++;
  }
  if (words[i] !== 'push') return null;
  const out = { gitArgs, remote: null, refspecs: [], force: false, del: false, all: false };
  for (const w of words.slice(i + 1)) {
    if (w === '--') continue;
    if (w.startsWith('-')) {
      if (/^(-f|--force|--force-with-lease.*|--force-if-includes)$/.test(w) || /^-[a-z]*f/.test(w)) out.force = true;
      if (w === '-d' || w === '--delete') out.del = true;
      if (w === '--all' || w === '--mirror' || w === '--branches') out.all = true;
      continue;
    }
    if (out.remote === null) out.remote = w;
    else out.refspecs.push(w);
  }
  return out;
}

/** For each refspec, the local source and the remote branch it updates. `src` null = delete. */
export function targets(push, currentBranch) {
  const specs = push.refspecs.length ? push.refspecs : [currentBranch];
  return specs.map((spec) => {
    const plain = spec.replace(/^\+/, '');
    const colon = plain.indexOf(':');
    let src = colon < 0 ? plain : plain.slice(0, colon);
    let dst = colon < 0 ? plain : plain.slice(colon + 1);
    if (colon < 0 && src === 'HEAD') dst = currentBranch;
    if (colon >= 0 && src === '') src = null;
    if (push.del) { dst = plain; src = null; }
    return { src: src === null ? null : src || 'HEAD', dst: branchName(dst) };
  });
}

/** Decision for one changed-file list: null when allowed, otherwise the reason. */
export function checkFiles(files) {
  const outside = files.filter((f) => !f.startsWith(ALLOWED_PREFIX));
  if (outside.length === 0) return null;
  return `pushes to main may only change files under ${ALLOWED_PREFIX}; this one also changes:\n  `
    + outside.slice(0, 20).join('\n  ')
    + (outside.length > 20 ? `\n  …and ${outside.length - 20} more` : '')
    + '\nPut code changes on a branch and open a pull request.';
}

function git(gitArgs, cwd, args) {
  return execFileSync('git', [...gitArgs, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Returns a block reason for a Bash command, or null to allow it. */
export function checkBash(command, cwd) {
  for (const words of splitCommands(command)) {
    const ghAt = words.findIndex((w) => w === 'gh' || w.endsWith('/gh'));
    const gh = ghAt < 0 ? [] : words.slice(ghAt + 1);
    if ((gh[0] === 'pr' && gh[1] === 'merge') || (gh[0] === 'api' && gh.some((w) => /pulls\/\d+\/merge\b/.test(w)))) {
      return 'merging pull requests is reserved for the repository owner.';
    }
    const push = parsePush(words);
    if (!push) continue;
    let current;
    try {
      current = git(push.gitArgs, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
      return 'could not read the current branch to check this push.';
    }
    if (push.all) return 'pushing all branches at once is not allowed; push one branch.';
    const remote = push.remote || 'origin';
    for (const t of targets(push, current)) {
      if (t.dst !== MAIN) continue;
      if (t.src === null) return 'deleting main is not allowed.';
      if (push.force) return 'force-pushing main is not allowed.';
      let files;
      try {
        git(push.gitArgs, cwd, ['fetch', '--quiet', remote, MAIN]);
        const head = git(push.gitArgs, cwd, ['rev-parse', '--verify', `${t.src}^{commit}`]);
        files = git(push.gitArgs, cwd, ['diff', '--name-only', '--no-renames', 'FETCH_HEAD', head])
          .split('\n').filter(Boolean);
      } catch (e) {
        return `could not work out which files this push changes (${String(e.message).split('\n')[0]}).`;
      }
      const reason = checkFiles(files);
      if (reason) return reason;
    }
  }
  return null;
}

/** Returns a block reason for a GitHub MCP tool call, or null to allow it. */
export function checkGithubTool(toolName, input = {}) {
  if (toolName.endsWith('merge_pull_request')) return 'merging pull requests is reserved for the repository owner.';
  if (branchName(String(input.branch || '')) !== MAIN) return null;
  const files = input.files ? input.files.map((f) => f.path) : [input.path].filter(Boolean);
  if (files.length === 0) return 'could not tell which files this write to main changes.';
  return checkFiles(files);
}

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.stderr.write('guard-main: could not read the hook input; blocking to be safe.\n');
    process.exit(2);
  }
  const { tool_name: tool = '', tool_input: input = {}, cwd = process.cwd() } = event;
  const reason = tool === 'Bash' ? checkBash(String(input.command || ''), cwd)
    : tool.startsWith('mcp__github__') ? checkGithubTool(tool, input)
      : null;
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/guard-main.mjs: ${reason}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
