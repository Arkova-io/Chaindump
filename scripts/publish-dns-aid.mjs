#!/usr/bin/env node

/**
 * Idempotently publish the DNS-AID SVCB records in Cloudflare.
 *
 * Safe by default: without DNS_AID_APPLY=true this only checks permissions and
 * prints the records that would be created. DNSSEC is never enabled unless
 * DNS_AID_ENABLE_DNSSEC=true is also supplied. The caller must still publish
 * Cloudflare's returned DS record at the registrar.
 */

const token = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID || 'e0db1713017f5da643066c2d2aa54bf4';
const apply = process.env.DNS_AID_APPLY === 'true';
const enableDnssec = process.env.DNS_AID_ENABLE_DNSSEC === 'true';
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required (never print or commit it)');
if (!/^[a-f0-9]{32}$/i.test(zoneId)) throw new Error('CLOUDFLARE_ZONE_ID must be a 32-character Cloudflare zone id');

const records = [
  {
    name: '_index._agents.chaindump.xyz',
    type: 'SVCB',
    ttl: 3600,
    data: { priority: 1, target: 'chaindump.xyz.', value: 'alpn="h2" port=443 mandatory="alpn,port"' },
  },
  {
    name: '_mcp._agents.chaindump.xyz',
    type: 'SVCB',
    ttl: 3600,
    data: { priority: 1, target: 'chaindump-mcp-270018525501.us-central1.run.app.', value: 'alpn="h2" port=443 mandatory="alpn,port"' },
  },
];

const api = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
async function cf(path, init = {}) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) {
    const code = body.errors?.[0]?.code ?? response.status;
    const message = body.errors?.[0]?.message ?? response.statusText;
    throw new Error(`Cloudflare API ${path} failed (${code}): ${message}`);
  }
  return body.result;
}

// A harmless read makes an insufficient token fail before any mutation.
const existing = await cf('/dns_records?type=SVCB&per_page=100');
const byName = new Map(existing.map((record) => [record.name.replace(/\\.$/, ''), record]));
for (const record of records) {
  const current = byName.get(record.name);
  const summary = { name: record.name, type: record.type, data: record.data, action: current ? 'already-present' : (apply ? 'create' : 'would-create') };
  console.log(JSON.stringify(summary));
  if (!current && apply) await cf('/dns_records', { method: 'POST', body: JSON.stringify(record) });
}

const dnssec = await cf('/dnssec');
console.log(JSON.stringify({ dnssec: { status: dnssec.status, ds: dnssec.ds || null }, apply, enable_dnssec: enableDnssec }));
if (enableDnssec && dnssec.status !== 'active') {
  if (!apply) {
    console.log(JSON.stringify({ action: 'would-enable-dnssec' }));
  } else {
    const enabled = await cf('/dnssec', { method: 'POST', body: JSON.stringify({}) });
    console.log(JSON.stringify({ dnssec_enabled: true, ds: enabled.ds || null }));
    console.error('Publish the returned DS record at the registrar before claiming DNSSEC validation.');
  }
}

if (!apply) console.log('Dry run only. Set DNS_AID_APPLY=true after DNS Records:Edit permission is granted.');
