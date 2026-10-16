import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
const routeSource=readFileSync(new URL('../src/app/app/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require,URL});
const route=mod.exports;

test('download redirect entry points use document anchors, never page-link RSC navigation',()=>{
  let count=0;
  for(const path of ['global-top-bar.tsx','local-guide-page.tsx']){
    const source=readFileSync(new URL('../src/components/'+path,import.meta.url),'utf8');
    const nodes=[...source.matchAll(/<(\w+)\b[^>]*\bhref="\/app"[^>]*>/g)];
    assert.ok(nodes.length,path);
    for(const node of nodes)assert.equal(node[1],'a',path);
    count+=nodes.length;
  }
  assert.equal(count,3);
});

test('normal desktop document navigation preserves query and reaches visible download choice',()=>{
  const request=new NextRequest('https://questhat.com/app?source=qa',{headers:{'user-agent':'Mozilla/5.0 Macintosh'}});
  for(const handler of [route.GET,route.HEAD]){
    const response=handler(request);
    assert.equal(response.status,307);
    assert.equal(response.headers.get('location'),'https://questhat.com/download?source=qa');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(response.headers.get('vary'),'User-Agent');
  }
});

test('document anchors retain existing native-store and crawler routing',()=>{
  for(const [ua,location] of [
    ['Mozilla/5.0 (iPhone)','https://apps.apple.com/us/app/questhat/id6787166004'],
    ['Mozilla/5.0 (Linux; Android 16)','https://play.google.com/store/apps/details?id=com.questhat.app'],
    ['facebookexternalhit/1.1 (iPhone)','https://questhat.com/download'],
  ]){
    const response=route.GET(new NextRequest('https://questhat.com/app',{headers:{'user-agent':ua}}));
    assert.equal(response.status,307);
    assert.equal(response.headers.get('location'),location);
  }
});
