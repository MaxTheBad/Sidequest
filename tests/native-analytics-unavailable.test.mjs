import test from 'node:test';
import assert from 'node:assert/strict';
import {createOptionalAnalytics} from '../apps/mobile/src/lib/optional-analytics.js';
test('an unavailable analytics SDK never advertises enabled state or accepts capture',async()=>{
 const a=createOptionalAnalytics(null);
 await a.enable();
 assert.equal(a.isEnabled(),false);
 assert.equal(a.capture('screen_viewed'),false);
 assert.equal(a.identify('qa-user'),false);
});
test('SDK opt-in failure leaves application-level capture disabled',async()=>{
 let captures=0;
 const a=createOptionalAnalytics({optIn:async()=>{throw new Error('fixture opt-in failed')},capture:()=>captures++});
 await assert.rejects(a.enable(),/fixture opt-in failed/);
 assert.equal(a.isEnabled(),false);
 assert.equal(a.capture('screen_viewed'),false);
 assert.equal(captures,0);
});
test('native SDK factory is not called while unset/denied and is reused only after a grant',async()=>{
 let created=0,captured=0;
 const a=createOptionalAnalytics(()=>{created++;return {optIn:async()=>{},optOut:async()=>{},reset(){},capture(){captured++}}});
 assert.equal(a.capture('screen_viewed'),false);
 await a.disable();a.reset();
 assert.equal(created,0);
 await a.enable();assert.equal(created,1);assert.equal(a.capture('screen_viewed'),true);
 await a.disable();await a.enable();assert.equal(created,1);assert.equal(captured,1);
});
test('a delayed opt-in cannot enable application capture after withdrawal',async()=>{
 let finish,optedOut=0;
 const a=createOptionalAnalytics(()=>({optIn:()=>new Promise(r=>finish=r),optOut:async()=>optedOut++,reset(){},capture(){throw new Error('must not capture')}}));
 const pending=a.enable();await a.disable();finish();await pending;
 assert.equal(a.isEnabled(),false);assert.equal(a.capture('screen_viewed'),false);
 assert.equal(optedOut,2,'late SDK opt-in is explicitly opted out again');
});
