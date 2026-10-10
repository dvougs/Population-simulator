import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePush, targets, checkFiles, checkGithubTool, splitCommands } from '../../.claude/hooks/guard-main.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '../../.claude/hooks/guard-main.mjs');

test('parsePush reads remote, refspecs and flags', () => {
  assert.equal(parsePush(['git', 'status']), null);
  assert.equal(parsePush(['git', 'commit', '-m', 'push']), null);
  assert.deepEqual(parsePush(['git', '-C', 'repo', 'push', '-u', 'origin', 'main']),
    { gitArgs: ['-C', 'repo'], remote: 'origin', refspecs: ['main'], force: false, del: false, all: false });
  assert.equal(parsePush(['git', 'push', '-f', 'origin', 'main']).force, true);
  assert.equal(parsePush(['git', 'push', '--force-with-lease', 'origin', 'main']).force, true);
  assert.equal(parsePush(['git', 'push', '--delete', 'origin', 'main']).del, true);
  assert.equal(parsePush(['git', 'push', '--follow-tags', 'origin', 'x']).force, false);
});

test('targets resolve HEAD, src:dst, refs/heads and deletes', () => {
  const t = (words, cur = 'feature') => targets(parsePush(words), cur);
  assert.deepEqual(t(['git', 'push']), [{ src: 'feature', dst: 'feature' }]);
  assert.deepEqual(t(['git', 'push'], 'main'), [{ src: 'main', dst: 'main' }]);
  assert.deepEqual(t(['git', 'push', 'origin', 'HEAD'], 'main'), [{ src: 'HEAD', dst: 'main' }]);
  assert.deepEqual(t(['git', 'push', 'origin', 'HEAD:refs/heads/main']), [{ src: 'HEAD', dst: 'main' }]);
  assert.deepEqual(t(['git', 'push', 'origin', '+feat:main']), [{ src: 'feat', dst: 'main' }]);
  assert.deepEqual(t(['git', 'push', 'origin', ':main']), [{ src: null, dst: 'main' }]);
  assert.deepEqual(t(['git', 'push', '-d', 'origin', 'main']), [{ src: null, dst: 'main' }]);
});

test('splitCommands sees pushes inside chains and bash -c', () => {
  const pushes = (c) => splitCommands(c).map(parsePush).filter(Boolean).length;
  assert.equal(pushes('git add . && git commit -m x && git push origin main'), 1);
  assert.equal(pushes("bash -c 'git push origin main'"), 1);
  assert.equal(pushes('ls; echo done'), 0);
});

test('checkFiles allows only project/', () => {
  assert.equal(checkFiles(['project/TASKS.md', 'project/PROGRESS.md']), null);
  assert.match(checkFiles(['project/TASKS.md', 'src/sim/step.js']), /src\/sim\/step\.js/);
  assert.match(checkFiles(['projects/x.md']), /projects\/x\.md/);
});

test('GitHub tools: merge always blocked, writes to main only under project/', () => {
  assert.match(checkGithubTool('mcp__github__merge_pull_request', { pullNumber: 3 }), /merging/);
  assert.equal(checkGithubTool('mcp__github__push_files', { branch: 'main', files: [{ path: 'project/A.md' }] }), null);
  assert.match(checkGithubTool('mcp__github__push_files', { branch: 'main', files: [{ path: 'src/a.js' }] }), /src\/a\.js/);
  assert.match(checkGithubTool('mcp__github__create_or_update_file', { branch: 'refs/heads/main', path: 'RULES.md' }), /RULES\.md/);
  assert.equal(checkGithubTool('mcp__github__create_or_update_file', { branch: 'claude/x', path: 'src/a.js' }), null);
});

// End to end through a real git repository with a local bare remote.
let dir;
const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: join(dir, 'w'), stdio: 'pipe' });
const commit = (path, text) => {
  mkdirSync(dirname(join(dir, 'w', path)), { recursive: true });
  writeFileSync(join(dir, 'w', path), text);
  git('add', '-A');
  git('commit', '-qm', path);
};
const runHook = (input) => spawnSync('node', [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
const bash = (command) => runHook({ tool_name: 'Bash', tool_input: { command }, cwd: join(dir, 'w') });

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'guard-main-'));
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', join(dir, 'remote.git')]);
  execFileSync('git', ['init', '-q', '-b', 'main', join(dir, 'w')]);
  git('remote', 'add', 'origin', join(dir, 'remote.git'));
  commit('project/A.md', 'a');
  commit('src/b.js', 'b');
  git('push', '-q', 'origin', 'main');
});

after(() => rmSync(dir, { recursive: true, force: true }));

test('hook allows a project/-only push to main and blocks one that touches src/', () => {
  commit('project/A.md', 'a2');
  assert.equal(bash('git push origin main').status, 0);
  assert.equal(bash('git push').status, 0);
  commit('src/b.js', 'b2');
  for (const cmd of ['git push origin main', 'git push', 'git push origin HEAD:refs/heads/main', 'git status && git push origin main']) {
    const r = bash(cmd);
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /src\/b\.js/, cmd);
  }
});

test('hook blocks force, delete, all-branches and merges, and allows other branches', () => {
  assert.equal(bash('git push -f origin main').status, 2);
  assert.equal(bash('git push origin --delete main').status, 2);
  assert.equal(bash('git push --all origin').status, 2);
  assert.equal(bash('gh pr merge 3 --squash').status, 2);
  assert.equal(bash('gh api -X PUT repos/o/r/pulls/3/merge').status, 2);
  git('checkout', '-qb', 'claude/cycle-x');
  assert.equal(bash('git push -u origin claude/cycle-x').status, 0);
  assert.equal(bash('git push origin claude/cycle-x:main').status, 2);
  assert.equal(bash('ls -la').status, 0);
});

test('hook blocks when it cannot read the input', () => {
  const r = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 2);
});
