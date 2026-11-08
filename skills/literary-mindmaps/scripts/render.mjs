import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
class WorkflowError extends Error {
  constructor(message) { super(message); this.field = message.split('：')[0]; }
}
async function readData(file,field) {
  let text;
  try {text=await readFile(file,'utf8');} catch {throw new WorkflowError(`${field}：无法读取；请检查文件路径和读取权限。`);}
  try {return JSON.parse(text.replace(/^\uFEFF/,''));} catch {throw new WorkflowError(`${field}：不是有效 JSON；请修正语法并保存为 UTF-8 JSON。`);}
}
export function projectRoot() {
  let candidate = skill;
  while (true) {
    if (existsSync(path.join(candidate, 'package.json')) && existsSync(path.join(candidate, 'pyproject.toml'))) return candidate;
    const next = path.dirname(candidate);
    if (next === candidate) throw new WorkflowError('项目目录：未找到根目录；请在 book-mindmaps 项目中运行。');
    candidate = next;
  }
}
export function pythonPath() {
  const root = projectRoot();
  const exe = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!existsSync(exe)) throw new WorkflowError('Python 环境：尚未安装；请先运行 uv sync --group dev。');
  return exe;
}
const md = value => String(value).replace(/[\\`*_{}\[\]<>#!|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
const classLabel = { fact: '原文事实', interpretation: '阅读解释', uncertain: '待确认' };
const layerLabel = { story: '故事', dream: '梦境', memory: '回忆', rumor: '传闻', hypothesis: '猜测', narrator: '叙述者判断' };
const refs = item => item.evidence.map(e => `[出处](sources.md#source-${e.paragraph_id})`).join(' ');
const tag = item => `【${classLabel[item.classification]} · ${layerLabel[item.layer]}】`;

export function markdownMaps(book, analysis) {
  const overview = [`# ${md(analysis.title)}`, ''];
  function walk(nodes, level) {
    for (const item of nodes) {
      const annotation = item.classification !== 'fact' || item.layer !== 'story' ? ` ${tag(item)}` : '';
      overview.push(`${'  '.repeat(level)}- ${md(item.label)}${annotation} ${refs(item)}`);
      walk(item.children, level + 1);
    }
  }
  walk(analysis.overview, 0);
  const themes = [`# ${md(analysis.title)} · 主题与意象`, ''];
  for (const item of analysis.themes) {
    themes.push(`## ${md(item.title)} ${refs(item)}`, `- ${tag(item)} ${md(item.description)}`);
    for (const alternative of item.alternative_readings) themes.push(`  - 其他读法：${md(alternative)}`);
  }
  if (!analysis.themes.length) themes.push('- 暂无主题分析');
  const characters = [`# ${md(analysis.title)} · 人物关系`, ''];
  const names = new Map(analysis.characters.map(c => [c.id, c.name]));
  for (const item of analysis.characters) characters.push(`## ${md(item.name)}`, `- 别名：${item.aliases.map(md).join('、') || '无'}`, `- ${tag(item)} ${md(item.description)} ${refs(item)}`, '');
  for (const item of analysis.relationships) characters.push(`- ${md(names.get(item.from))} → ${md(names.get(item.to))}：${md(item.label)} ${tag(item)} ${refs(item)}`);
  const timeline = [`# ${md(analysis.title)} · 双时间线`, ''];
  for (const [field, label] of [['narrative_order', '作者叙述顺序'], ['story_order', '故事发生顺序']]) {
    timeline.push(`## ${label}`);
    for (const item of [...analysis.events].sort((a, b) => (a[field] ?? Infinity) - (b[field] ?? Infinity))) {
      timeline.push(`- ${item[field] ?? '顺序未定'} · ${md(item.title)} ${tag(item)} ${refs(item)}`, `  - ${md(item.summary)}`);
      if (item.uncertainty) timeline.push(`  - 顺序说明：${md(item.uncertainty)}`);
    }
  }
  const sources = [`# ${md(book.title)} · 原文定位`, '', `源文件：${md(book.source.filename)}`, `SHA-256：${book.source.sha256}`, ''];
  const referenced = new Set([...analysis.characters, ...analysis.relationships, ...analysis.events, ...analysis.themes].flatMap(i => i.evidence.map(e => e.paragraph_id)));
  function collect(nodes) { for (const node of nodes) { node.evidence.forEach(e => referenced.add(e.paragraph_id)); collect(node.children); } }
  collect(analysis.overview);
  for (const section of book.sections) {
    for (const paragraph of section.paragraphs.filter(p => referenced.has(p.id))) {
      const loc = paragraph.locator;
      sources.push(`## ${paragraph.id} · ${md(section.title)}`, `<a id="source-${paragraph.id}"></a>`, `定位：${loc.pdf_page ? `PDF 文件第 ${loc.pdf_page} 页` : md(loc.epub_path)} · 第 ${loc.paragraph} 段`, '', paragraph.text, '');
    }
  }
  return { overview: overview.join('\n'), characters: characters.join('\n'), timeline: timeline.join('\n'), themes: themes.join('\n'), sources: sources.join('\n') };
}

export async function render(bookFile, analysisFile, output, force = false) {
  const root = projectRoot();
  const verify = spawnSync(pythonPath(), [path.join(skill, 'scripts/bookmaps.py'), 'validate', bookFile, analysisFile], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (verify.status !== 0) {
    try { const report=JSON.parse(verify.stdout); if(report.ok===false&&Array.isArray(report.errors))return report; } catch {}
    throw new WorkflowError('分析核验：无法完成；请先运行 Python validate 命令检查依赖和输入文件。');
  }
  const book = await readData(bookFile,'原文索引');
  const analysis = await readData(analysisFile,'分析文件');
  if (existsSync(output) && (await readdir(output)).length && !force) throw new WorkflowError('输出目录：目录非空；请选择新目录，或确认替换后使用 --force。');
  const cli = path.join(root, 'node_modules/@markmap/cli/dist/cli.js');
  if (!existsSync(cli)) throw new WorkflowError('导图依赖：尚未安装；请在项目根目录运行 npm ci。');
  await mkdir(output, { recursive: true });
  const maps = markdownMaps(book, analysis);
  const html = {};
  for (const [name, content] of Object.entries(maps)) {
    await writeFile(path.join(output, `${name}.md`), content, 'utf8');
    if (name === 'overview' || name === 'themes') {
      const generated = spawnSync(process.execPath, [cli, path.join(output, `${name}.md`), '-o', path.join(output, `${name}.html`), '--no-open'], { encoding: 'utf8' });
      if (generated.status !== 0) throw new WorkflowError(`导图 ${name}：Markmap 渲染失败；请检查本地 Node 版本与依赖。`);
      html[name] = await readFile(path.join(output, `${name}.html`), 'utf8');
      // A sandboxed frame may only request a locator; the parent checks its source.
      const bridge = `<script>document.addEventListener('click',function(e){const a=e.composedPath().find(n=>n.tagName&&n.tagName.toLowerCase()==='a');if(!a)return;const h=a.getAttribute('href')||'';const m=h.match(/#source-(s[0-9]+-p[0-9]+)$/);if(m){e.preventDefault();parent.postMessage({type:'bookmaps-source',id:m[1]},'*');}},true);</script>`;
      html[name] = html[name].replace(/<\/body>/i, `${bridge}</body>`);
    }
  }
  const used = new Set();
  function evidence(items) { for (const item of items) { item.evidence.forEach(e => used.add(e.paragraph_id)); if (item.children) evidence(item.children); } }
  evidence([...analysis.characters, ...analysis.relationships, ...analysis.events, ...analysis.themes, ...analysis.overview]);
  const sources = book.sections.flatMap(section => section.paragraphs.filter(p => used.has(p.id)).map(p => ({ ...p, section_id: section.id, section_title: section.title })));
  const payload = JSON.stringify({ book: { ...book, sections: book.sections.map(({ paragraphs, ...section }) => ({ ...section, paragraph_count: paragraphs.length })) }, analysis, sources, maps: html }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const template = await readFile(path.join(skill, 'assets/reader.html'), 'utf8');
  await writeFile(path.join(output, 'index.html'), template.replace('/*BOOKMAPS_DATA*/', () => payload), 'utf8');
  await writeFile(path.join(output, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ ...JSON.parse(verify.stdout), source_sha256: book.source.sha256, referenced_paragraphs: sources.length }, null, 2), 'utf8');
  return { ok: true, output: path.join(output, 'index.html'), maps: Object.keys(maps), referenced_paragraphs: sources.length };
}

export async function main(args) {
  try {
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--force') options.force = true;
      else if (['--book', '--analysis', '--out'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
      else throw new WorkflowError('命令参数：包含未知选项或缺少值；请使用 --book、--analysis、--out 和可选 --force。');
    }
    for (const key of ['book', 'analysis', 'out']) if (!options[key]) throw new WorkflowError(`${key}：不能为空；请提供 --${key} 路径。`);
    const result = await render(path.resolve(options.book), path.resolve(options.analysis), path.resolve(options.out), options.force);
    console.log(JSON.stringify(result));
    return result.ok ? 0 : 2;
  } catch (failure) {
    const specific = failure instanceof WorkflowError ? failure.message : '输入或输出文件：无法生成导图；请检查文件格式、路径权限和本地依赖。';
    console.log(JSON.stringify({ ok: false, errors: [{ field: failure instanceof WorkflowError ? failure.field : '导图生成', code: 'render_failed', message: specific }] }));
    return 2;
  }
}
