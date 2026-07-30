#!/usr/bin/env node

/**
 * Verify the public DNS-AID record through a validating DNS-over-HTTPS resolver.
 *
 * This intentionally requires AD=true. A record in a provider dashboard or a
 * committed zone file is not publication proof unless a validating resolver
 * returns authenticated data.
 */

const dnsAidName = process.env.DNS_AID_NAME || '_index._agents.chaindump.xyz';
const resolver = process.env.DNS_AID_RESOLVER || 'https://cloudflare-dns.com/dns-query';
const url = new URL(resolver);
url.searchParams.set('name', dnsAidName);
url.searchParams.set('type', 'SVCB');
url.searchParams.set('do', '1');

const response = await fetch(url, { headers: { accept: 'application/dns-json' } });
if (!response.ok) throw new Error(`DNS-over-HTTPS request failed (${response.status})`);
const payload = await response.json();
const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
const svcb = answers.find((answer) => answer.type === 64 || answer.type === 'SVCB');
const data = typeof svcb?.data === 'string' ? svcb.data : '';
const hasAlpn = /(?:^|[\\s])alpn(?:=|\\s)/i.test(data);
const hasEndpoint = /(?:^|[\\s])(?:port|target)(?:=|\\s)/i.test(data);

const result = {
  noerror: payload.Status === 0,
  authenticated: payload.AD === true,
  has_alpn: hasAlpn,
  has_endpoint_parameter: hasEndpoint,
};
console.log(JSON.stringify(result, null, 2));

if (payload.Status !== 0 || payload.AD !== true || !svcb || !hasAlpn || !hasEndpoint) {
  throw new Error('DNS-AID verification failed: require NOERROR, SVCB, alpn, endpoint parameter, and AD=true');
}
