// Uploads App Store screenshots via the App Store Connect API.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (p8 contents), ASC_APP_ID
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY, ASC_APP_ID } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY || !ASC_APP_ID) throw new Error('Missing ASC_* env');

const API = 'https://api.appstoreconnect.apple.com/v1';

// Normalize the private key: strip CR/whitespace, ensure PEM framing
let PK = ASC_PRIVATE_KEY.replace(/\r/g, '').trim();
if (!PK.includes('BEGIN')) PK = `-----BEGIN PRIVATE KEY-----\n${PK.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
try {
  const k = crypto.createPrivateKey(PK);
  console.log('Key OK:', k.asymmetricKeyType, k.asymmetricKeyDetails?.namedCurve, '| keyId len', ASC_KEY_ID.length, '| issuer len', ASC_ISSUER_ID.length, '| pem lines', PK.split('\n').length);
} catch (e) { throw new Error('Private key could not be parsed: ' + e.message); }

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: PK, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(sig)}`;
}
async function api(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method, headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

// Plan: { displayType: [files] }
const plan = {
  APP_IPHONE_67: ['ios67-en-1-start.png', 'ios67-en-2-in.png', 'ios67-en-3-out.png', 'ios67-color-purple.png', 'ios67-color-orange.png'],
};
const dir = path.resolve('store/screenshots');
const locale = process.env.ASC_LOCALE || 'en-US';

const versions = await api('GET', `/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5`);
const version = versions.data.find(v => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState)) || versions.data[0];
console.log('Version', version.attributes.versionString, version.attributes.appStoreState);

const locs = await api('GET', `/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
let loc = locs.data.find(l => l.attributes.locale === locale);
if (!loc) {
  loc = (await api('POST', '/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } })).data;
}
console.log('Localization', loc.attributes.locale, loc.id);

const sets = await api('GET', `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);

for (const [displayType, files] of Object.entries(plan)) {
  let set = sets.data.find(s => s.attributes.screenshotDisplayType === displayType);
  if (!set) {
    set = (await api('POST', '/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
    console.log('Created set', displayType);
  }
  const existing = await api('GET', `/appScreenshotSets/${set.id}/appScreenshots`);
  const existingNames = new Set(existing.data.map(s => s.attributes.fileName));

  for (const file of files) {
    if (existingNames.has(file)) { console.log('Skip (exists)', file); continue; }
    const buf = fs.readFileSync(path.join(dir, file));
    const reserve = await api('POST', '/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: file, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } });
    const shot = reserve.data;
    for (const op of shot.attributes.uploadOperations) {
      const chunk = buf.subarray(op.offset, op.offset + op.length);
      const headers = Object.fromEntries(op.requestHeaders.map(h => [h.name, h.value]));
      const r = await fetch(op.url, { method: op.method, headers, body: chunk });
      if (!r.ok) throw new Error(`Chunk upload failed ${r.status}`);
    }
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    await api('PATCH', `/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: md5 } } });
    console.log('Uploaded', file);
  }
}
console.log('Done');
