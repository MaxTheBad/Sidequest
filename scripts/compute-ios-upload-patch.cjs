// Read-only patch generator: preserve all existing project/Live Activity data.
// CommonJS is required by the installed xcode parser's audit helper.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs=require('node:fs'),xcode=require('xcode');
const path='apps/mobile/ios/QuestHat.xcodeproj/project.pbxproj';
const source=fs.readFileSync(path,'utf8');
const p=xcode.project(path);p.parseSync();
const targets=p.pbxNativeTargetSection();
const main=Object.values(targets).find(t=>t&&typeof t==='object'&&String(t.name).replaceAll('"','')==='QuestHat');
const bundle=p.pbxItemByComment('Bundle React Native code and images','PBXShellScriptBuildPhase');
const code=JSON.parse(bundle.shellScript);
if(!code.includes('\n"$REACT_NATIVE_XCODE_SCRIPT"\n')) throw new Error('Unexpected Expo bundle phase; no patch generated');
const wrapper=[
 'if [[ "$CONFIGURATION" != *Debug* && "$SENTRY_DISABLE_AUTO_UPLOAD" != true ]]; then',
 '  "$NODE_BINARY" "$PROJECT_ROOT/../../scripts/check-release-inputs.mjs" --native',
 'fi',
 'SENTRY_XCODE_SCRIPT="$("$NODE_BINARY" --print "require(\'path\').dirname(require.resolve(\'@sentry/react-native/package.json\')) + \'/scripts/sentry-xcode.sh\'")"',
 '/bin/sh "$SENTRY_XCODE_SCRIPT" "$REACT_NATIVE_XCODE_SCRIPT"',
].join('\n');
const updated=code.replace('\n"$REACT_NATIVE_XCODE_SCRIPT"\n','\n'+wrapper+'\n');
const fromLine=source.split('\n').find(l=>l.includes('shellScript = '+bundle.shellScript));
const toLine=fromLine.replace(bundle.shellScript,JSON.stringify(updated))+'\n\t\t\tshowEnvVarsInLog = 0;';
const id='C14E6A1B2026101400000001';
if(source.includes(id)) throw new Error('Upload phase already exists');
const last=main.buildPhases.at(-1);
const anchor=source.split('\n').find(l=>l.includes(last.value+' /* '+last.comment+' */,'));
const debug='/bin/sh "$("${NODE_BINARY:-node}" --print "require(\'path\').dirname(require.resolve(\'@sentry/react-native/package.json\')) + \'/scripts/sentry-xcode-debug-files.sh\'")"';
const object=[
 '\t\t'+id+' /* Upload Debug Symbols to Sentry */ = {',
 '\t\t\tisa = PBXShellScriptBuildPhase;',
 '\t\t\tbuildActionMask = 2147483647;',
 '\t\t\tfiles = ();',
 '\t\t\tname = "Upload Debug Symbols to Sentry";',
 '\t\t\trunOnlyForDeploymentPostprocessing = 0;',
 '\t\t\tshellPath = /bin/sh;',
 '\t\t\tshellScript = '+JSON.stringify(debug)+';',
 '\t\t\tshowEnvVarsInLog = 0;',
 '\t\t};',
].join('\n');
console.log(JSON.stringify({path,edits:[
 {from:fromLine,to:toLine},
 {from:anchor,to:anchor+'\n\t\t\t\t'+id+' /* Upload Debug Symbols to Sentry */,'},
 {from:'/* Begin PBXShellScriptBuildPhase section */',to:'/* Begin PBXShellScriptBuildPhase section */\n'+object},
]}));
