import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectIndex } from '../tools/check-git-content.mjs';

test('Git guard permits code and public source metadata, and rejects forced local book content', () => {
  const cache = path.resolve('.cache/git-content-tests');
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(path.join(cache, 'repo-'));
  const git = args => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `Git fixture command failed: ${args[0]}`);
  };
  const stage = filename => {
    const target = path.join(directory, filename);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'Synthetic Git guard fixture; not a book.\n');
    git(['add', '-f', '--', filename]);
  };
  try {
    git(['init', '--quiet']);
    writeFileSync(path.join(directory, '.gitignore'), readFileSync('.gitignore'));
    stage('tools/reader.mjs');
    stage('docs/book-sources.md');
    assert.equal(inspectIndex(directory).ok, true);
    for (const filename of ['books/plaintext.txt', 'books/scans/page.png', 'output/source/book.json', 'misplaced.EPUB', 'misplaced.pdf', 'misplaced.azw3']) {
      git(['check-ignore', '--no-index', '--quiet', '--', filename]);
      stage(filename);
      const result = inspectIndex(directory);
      assert.equal(result.ok, false, filename);
      assert.ok(result.errors.some(error => error.field === filename && error.code === 'local_book_content'));
      git(['rm', '--cached', '--', filename]);
      assert.equal(inspectIndex(directory).ok, true);
    }
    writeFileSync(path.join(directory, 'tools/check-git-content.mjs'), readFileSync('tools/check-git-content.mjs'));
    git(['config', '--local', 'core.hooksPath', path.resolve('.githooks')]);
    stage('books/forced-source.txt');
    const blocked = spawnSync('git', ['-c', 'user.name=Git Guard Test', '-c', 'user.email=git-guard@example.invalid', 'commit', '-m', 'Synthetic source rejection test'], { cwd: directory, encoding: 'utf8', windowsHide: true });
    assert.ifError(blocked.error);
    assert.notEqual(blocked.status, 0, 'The real pre-commit hook must reject forced book content');
    assert.match(blocked.stdout + blocked.stderr, /local_book_content/);
    assert.ok(existsSync(path.join(directory, 'books/forced-source.txt')), 'The guard must preserve the local source file');
    assert.notEqual(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: directory, stdio: 'ignore', windowsHide: true }).status, 0, 'The rejected commit must not create history');
  } finally {
    const resolved = realpathSync(directory);
    assert.ok(resolved.startsWith(realpathSync(cache) + path.sep), 'Cleanup target must remain in the test cache');
    rmSync(resolved, { recursive: true, force: true });
  }
});
