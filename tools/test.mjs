import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pythonPath, projectRoot } from '../skills/literary-mindmaps/scripts/render.mjs';
const root=projectRoot();
const python=spawnSync(pythonPath(),['-m','unittest','discover','-s','tests','-p','test_*.py','-v'],{cwd:root,stdio:'inherit',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
if(python.status!==0)process.exitCode=python.status||1;
else{const node=spawnSync(process.execPath,['--test','tests/render.test.mjs','tests/git-content.test.mjs'],{cwd:root,stdio:'inherit'});process.exitCode=node.status||0;}
