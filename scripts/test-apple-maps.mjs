import fs from 'fs';
const envPath = './.env.local';
const raw = fs.readFileSync(envPath,'utf8');
for(const line of raw.split(/\n/)){
  const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
  if(m){ const k=m[1], v=m[2]; if(!process.env[k]) process.env[k]=v; }
}
const teamId = process.env.APPLE_MAPS_TEAM_ID;
const keyId = process.env.APPLE_MAPS_KEY_ID;
let privateKey = process.env.APPLE_MAPS_PRIVATE_KEY || '';
if(!teamId||!keyId||!privateKey){ console.error('Missing APPLE_MAPS_* vars.'); process.exit(2);}
privateKey = privateKey.replace(/\\n/g,'\n');
const { importPKCS8, SignJWT } = await import('jose');
const now = Math.floor(Date.now()/1000);
const key = await importPKCS8(privateKey,'ES256');
const jwt = await new SignJWT({ scope: 'server_api' })
  .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
  .setIssuer(teamId)
  .setIssuedAt(now)
  .setExpirationTime(now + 600)
  .sign(key);
console.log('Generated JWT (short):', jwt.slice(0,40)+'...');

const tokenRes = await fetch('https://maps-api.apple.com/v1/token',{ method:'POST', headers:{ Authorization: `Bearer ${jwt}` } });
console.log('Token endpoint status:', tokenRes.status);
const tokenBody = await tokenRes.text();
console.log('Token response body (truncated):', tokenBody.slice(0,800));
try{ const parsed = JSON.parse(tokenBody); if(parsed.accessToken){
    console.log('Received accessToken (short):', parsed.accessToken.slice(0,30)+'...');
    const q = encodeURIComponent('German line motorsports');
    const searchRes = await fetch(`https://maps-api.apple.com/v1/search?q=${q}&lang=en-US`,{ headers: { Authorization: `Bearer ${parsed.accessToken}` } });
    console.log('Search status:', searchRes.status);
    const sb = await searchRes.text();
    console.log('Search response (truncated):', sb.slice(0,2000));
  }
}catch(e){ console.error('Error parsing token response:', e); }
