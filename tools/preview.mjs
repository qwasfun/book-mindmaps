import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function startPreview(directory, port = 0) {
  const root = path.resolve(directory);
  const server = http.createServer(async (request,response) => {
    if (!['GET','HEAD'].includes(request.method)) {response.writeHead(405);response.end();return;}
    try {
      const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
      const target=path.resolve(root,`.${pathname.endsWith('/')?`${pathname}index.html`:pathname}`);
      if(!target.startsWith(`${root}${path.sep}`)){response.writeHead(403);response.end();return;}
      if(!(await stat(target)).isFile()){response.writeHead(404);response.end();return;}
      const type={'.html':'text/html; charset=utf-8','.md':'text/markdown; charset=utf-8','.json':'application/json; charset=utf-8'}[path.extname(target)]||'application/octet-stream';
      response.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
      response.end(request.method==='HEAD'?undefined:await readFile(target));
    } catch {response.writeHead(404);response.end('文件未找到');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}/`};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  const preview=await startPreview(process.argv[2]||'output/demo/maps',Number(process.argv[3]||4173));
  console.log(`本地预览：${preview.url}（Ctrl+C 停止；只提供指定导图目录）`);
}
