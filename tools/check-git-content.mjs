import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ebookFormat = /\.(?:pdf|epub|mobi|azw3?|kfx|djvu?|fb2|cbz|cbr)$/i;

export function inspectIndex(directory = process.cwd()) {
  const result = spawnSync('git', ['ls-files', '--cached', '-z'], {
    cwd: directory, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return { ok: false, errors: [{ field: 'Git 暂存区', code: 'index_unavailable', message: 'Git 暂存区：无法读取文件清单；请在已初始化的项目仓库内运行并检查 .git 权限。' }] };
  }
  const files = result.stdout.split('\0').filter(Boolean);
  const errors = [];
  for (const filename of files) {
    const normalized = filename.replaceAll('\\', '/');
    let reason;
    if (/^books\//i.test(normalized)) reason = 'books/ 中的图书和其他本地文件不得提交';
    else if (/^output\//i.test(normalized)) reason = 'output/ 中的提取全文、OCR 和生成物不得提交';
    else if (ebookFormat.test(normalized)) reason = '电子书源文件不得提交';
    if (reason) errors.push({ field: filename, code: 'local_book_content', message: `${filename}：${reason}；请只从暂存区移除，保留本地文件，图书源文件统一放在 books/。` });
  }
  return errors.length ? { ok: false, errors } : { ok: true, tracked_files: files.length, message: 'Git 暂存区检查通过：未包含 books/、output/ 或常见电子书源文件。' };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const result = inspectIndex();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
