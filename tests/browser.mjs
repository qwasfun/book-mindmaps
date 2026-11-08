import path from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { startPreview } from '../tools/preview.mjs';
import { projectRoot } from '../skills/literary-mindmaps/scripts/render.mjs';
const root=projectRoot();
await mkdir(path.join(root,'output/playwright'),{recursive:true});
const preview=await startPreview(path.join(root,'output/demo/maps'));
const session=`bookmaps-check-${process.pid}`;
function cli(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/cli/playwright-cli.js'),`-s=${session}`,...args],{cwd:root,windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output}));});}
try{
  const opened=await cli(['open',preview.url,'--browser=msedge']);
  if(opened.code!==0)throw new Error(opened.output);
  const result=await cli(['run-code','--filename=tests/browser-checks.js']);
  await writeFile(path.join(root,'output/playwright/browser-result.txt'),result.output,'utf8');
  if(result.code!==0||result.output.includes('### Error'))throw new Error(result.output);
  const match=result.output.match(/### Result\s*\n([\s\S]*?)\n### /);
  if(!match)throw new Error(`浏览器结果无法解析：${result.output}`);
  const report=JSON.parse(match[1]);
  if(!report.ok)throw new Error('浏览器检查未成功');
  await writeFile(path.join(root,'output/playwright/verification.json'),JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await cli(['close']);await new Promise(resolve=>preview.server.close(resolve));}
