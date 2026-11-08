import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pythonPath, projectRoot, render } from '../skills/literary-mindmaps/scripts/render.mjs';

const root = projectRoot();
const output = path.join(root, 'output/demo');
const result = spawnSync(pythonPath(), [path.join(root, 'tools/demo.py'), output], {stdio:'inherit',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
if (result.status !== 0) process.exitCode = result.status || 1;
else {
  const rendered = await render(path.join(output,'source/book.json'),path.join(output,'analysis.json'),path.join(output,'maps'),true);
  console.log(JSON.stringify(rendered));
  process.exitCode = rendered.ok ? 0 : 1;
}
