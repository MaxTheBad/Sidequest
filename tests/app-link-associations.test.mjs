import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function route(path, fingerprint) {
  // These route bodies use valid JS; strip only their two export declarations.
  const source=readFileSync(new URL('../src/app/.well-known/'+path+'/route.ts',import.meta.url),'utf8');
  const sandbox={Response,process:{env:{QUESTHAT_ANDROID_APP_LINK_SHA256:fingerprint}}};
  vm.runInNewContext(source.replace('export const runtime','const runtime').replace('export function GET','function GET')+';result=GET();',sandbox);
  return sandbox.result;
}

test('AASA is actual JSON for verified app identity and listing paths only',async()=>{
  const r=route('apple-app-site-association');
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type'),/^application\/json/);
  assert.deepEqual(await r.json(),{applinks:{details:[{appIDs:['3258CL32QP.com.questhat.app'],components:[{'/':'/listing/*'}]}]}});
});
test('Android association pins the verified Play app-signing certificate, not the upload certificate',async()=>{
  const r=route('assetlinks.json');
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type'),/^application\/json/);
  const data=await r.json();
  assert.deepEqual(data,[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'com.questhat.app',sha256_cert_fingerprints:['4D:2A:2E:36:72:4F:0C:92:D3:EE:46:11:2C:1F:F4:58:83:29:59:6C:60:8C:C4:49:8D:C8:22:DE:E8:33:82:B5']}}]);
  assert.match(data[0].target.sha256_cert_fingerprints[0],/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});
test('runtime environment cannot silently substitute an unreviewed signing fingerprint',async()=>{
  const expected=await route('assetlinks.json').json();
  for(const value of ['not-a-certificate',Array(32).fill('AB').join(':')]) assert.deepEqual(await route('assetlinks.json',value).json(),expected);
});
test('native link repair preserves released identifiers, versions and feature flags',()=>{
  const c=JSON.parse(readFileSync(new URL('../apps/mobile/app.json',import.meta.url))).expo;
  assert.deepEqual(c.ios.associatedDomains,['applinks:questhat.com']);
  assert.equal(c.ios.bundleIdentifier,'com.questhat.app');
  assert.equal(c.android.package,'com.questhat.app');
  assert.equal(c.ios.buildNumber,'130');
  assert.equal(c.android.versionCode,16);
  assert.equal(c.extra.postQuestFollowUpsEnabled,true);
  assert.equal(c.extra.nativeFeedbackEnabled,true);
  assert.equal(c.android.intentFilters[0].autoVerify,true);
});
