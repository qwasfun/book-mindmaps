import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownMaps, main } from '../skills/literary-mindmaps/scripts/render.mjs';

test('unsupported render options produce actionable structured errors', async () => {
  const saved=console.log;let output;
  console.log=value=>{output=JSON.parse(value);};
  try {assert.equal(await main(['--book']),2);assert.equal(output.ok,false);assert.match(output.errors[0].message,/缺少值/);} finally {console.log=saved;}
});

test('literal book markup cannot become active markup in a map', () => {
  const evil='<img src=x onerror=alert(1)> [click](https://example.com)';
  const item={id:'node',label:evil,children:[],classification:'fact',layer:'story',evidence:[]};
  const result=markdownMaps({title:'book',source:{filename:'book.epub',sha256:'a'.repeat(64)},sections:[]},{title:'book',overview:[item],characters:[],relationships:[],events:[],themes:[]});
  assert.ok(!/(^|[^\\])<img/.test(result.overview));
  assert.ok(result.overview.includes('\\<img'));
  assert.ok(!result.overview.includes('[click]'));
});
