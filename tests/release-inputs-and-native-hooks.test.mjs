import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {missingReleaseInputs} from '../scripts/check-release-inputs.mjs';
const require=createRequire(import.meta.url);
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('shipping inputs fail closed without explicit build environment and reject upload suppression',()=>{
 assert.deepEqual(missingReleaseInputs('native',{}),['EXPO_PUBLIC_POSTHOG_KEY','SENTRY_AUTH_TOKEN']);
 const env={EXPO_PUBLIC_POSTHOG_KEY:'phc_fixture_public',SENTRY_AUTH_TOKEN:'fixture-only-not-a-credential'};
 assert.deepEqual(missingReleaseInputs('native',env),[]);
 for(const n of ['SENTRY_DISABLE_AUTO_UPLOAD','SENTRY_DISABLE_XCODE_DEBUG_UPLOAD','SENTRY_ALLOW_FAILURE']) assert.ok(missingReleaseInputs('native',{...env,[n]:'true'}).length);
 assert.ok(missingReleaseInputs('native',{...env,SENTRY_ORG:'other'}).length);
});
test('Expo config injects only the public native key and never serializes the upload token',()=>{
 const prior={...process.env};
 try{
  process.env.EXPO_PUBLIC_POSTHOG_KEY='phc_fixture_public';process.env.SENTRY_AUTH_TOKEN='fixture-secret-must-not-serialize';
  const config=require('../apps/mobile/app.config.js')();
  assert.equal(config.extra.posthogKey,'phc_fixture_public');
  assert.equal(JSON.stringify(config).includes(process.env.SENTRY_AUTH_TOKEN),false);
  process.env.EXPO_PUBLIC_POSTHOG_KEY='$UNRESOLVED_PUBLIC_KEY';
  assert.equal(require('../apps/mobile/app.config.js')().extra.posthogKey,undefined);
 }finally{for(const k of ['EXPO_PUBLIC_POSTHOG_KEY','SENTRY_AUTH_TOKEN']){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}}
});
test('native uploader properties contain only public routing metadata',()=>{
 for(const platform of ['ios','android']){
  const s=file(`apps/mobile/${platform}/sentry.properties`);
  assert.match(s,/defaults.org=anlvio-llc/);assert.match(s,/defaults.project=questhat/);
  assert.doesNotMatch(s,/^auth\.token=/m);
 }
});
test('iOS main target has JS and native upload hooks while Live Activity phases are unchanged',()=>{
 const xcode=require('xcode');const p=xcode.project(new URL('../apps/mobile/ios/QuestHat.xcodeproj/project.pbxproj',import.meta.url).pathname);p.parseSync();
 const targets=Object.values(p.pbxNativeTargetSection()).filter(x=>x&&typeof x==='object');
 const main=targets.find(x=>x.name==='QuestHat'),extension=targets.find(x=>x.name==='QuestHatLiveActivity');
 assert.ok(main.buildPhases.some(x=>x.comment==='Upload Debug Symbols to Sentry'));
 assert.ok(!extension.buildPhases.some(x=>/Sentry/.test(x.comment)));
 const bundle=p.pbxItemByComment('Bundle React Native code and images','PBXShellScriptBuildPhase');
 const code=JSON.parse(bundle.shellScript);
 assert.match(code,/sentry-xcode\.sh/);assert.match(code,/check-release-inputs\.mjs/);
 execFileSync('/bin/bash',['-n'],{input:code});
 const debug=p.pbxItemByComment('Upload Debug Symbols to Sentry','PBXShellScriptBuildPhase');
 execFileSync('/bin/bash',['-n'],{input:JSON.parse(debug.shellScript)});
 assert.equal(debug.showEnvVarsInLog,0);
 const original=execFileSync('git',['show','1425ac5:apps/mobile/ios/QuestHat.xcodeproj/project.pbxproj'],{encoding:'utf8'});
 const parser=require('xcode/lib/parser/pbxproj');const old=parser.parse(original).project.objects.PBXNativeTarget;
 const oldExt=Object.values(old).find(x=>x&&typeof x==='object'&&x.name==='QuestHatLiveActivity');
 assert.deepEqual(extension,oldExt);
});
test('Android JS/Hermes release hook and explicit preflight are wired without changing minification policy',()=>{
 const s=file('apps/mobile/android/app/build.gradle');
 assert.match(s,/sentry\.gradle/);assert.match(s,/verifyQuestHatReleaseInputs/);
 assert.match(s,/preReleaseBuild/);assert.match(s,/check-release-inputs\.mjs/);
 assert.match(s,/android\.enableMinifyInReleaseBuilds.*false/);
});
test('tracked native associated-domain entitlement matches app config and preserves push entitlement',()=>{
 const s=file('apps/mobile/ios/QuestHat/QuestHat.entitlements');
 assert.match(s,/com\.apple\.developer\.associated-domains/);assert.match(s,/applinks:questhat\.com/);
 assert.match(s,/<key>aps-environment<\/key>\s*<string>production<\/string>/);
});
