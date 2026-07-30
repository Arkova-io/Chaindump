import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

async function freshWorker() {
  vi.resetModules();
  return (await import('../src/worker.js')).default;
}

describe('agent discovery metadata', () => {
  it('keeps OAuth metadata absent and explains the truthful x402 boundary by default', async () => {
    const worker = await freshWorker();
    const env = {};

    const auth = await worker.fetch(new Request('http://localhost/auth.md'), env, ctx());
    expect(auth.status).toBe(200);
    expect(auth.headers.get('content-type')).toContain('text/markdown');
    const authBody = await auth.text();
    expect(authBody).toContain('# auth.md');
    expect(authBody).toContain('Agent registration is not required');
    expect(authBody).toContain('x402');
    expect(authBody).toContain('Registration endpoint: none required');
    expect(authBody).toContain('OAuth (not configured)');

    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
      '/.well-known/oauth-protected-resource',
    ]) {
      const response = await worker.fetch(new Request(`http://localhost${path}`), env, ctx());
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).error).toBe('oauth_not_configured');
    }
  });

  it('publishes complete OAuth metadata only when a real issuer configuration is supplied', async () => {
    const worker = await freshWorker();
    const env = {
      OAUTH_ISSUER: 'https://login.example.test',
      OAUTH_AUTHORIZATION_ENDPOINT: 'https://login.example.test/authorize',
      OAUTH_TOKEN_ENDPOINT: 'https://login.example.test/token',
      OAUTH_JWKS_URI: 'https://login.example.test/.well-known/jwks.json',
      OAUTH_REGISTER_URI: 'https://login.example.test/register',
      OAUTH_CLAIM_URI: 'https://login.example.test/claims',
    };
    const response = await worker.fetch(new Request('http://localhost/.well-known/oauth-authorization-server'), env, ctx());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer: 'https://login.example.test',
      authorization_endpoint: 'https://login.example.test/authorize',
      token_endpoint: 'https://login.example.test/token',
      jwks_uri: 'https://login.example.test/.well-known/jwks.json',
      registration_endpoint: 'https://login.example.test/register',
      grant_types_supported: ['authorization_code', 'client_credentials'],
      response_types_supported: ['code'],
      agent_auth: {
        skill: 'https://chaindump.xyz/auth.md',
        register_uri: 'https://login.example.test/register',
        identity_types_supported: ['anonymous'],
        anonymous: { claim_uri: 'https://login.example.test/claims' },
      },
    });

    const resource = await worker.fetch(new Request('http://localhost/.well-known/oauth-protected-resource'), env, ctx());
    expect(resource.status).toBe(200);
    expect(await resource.json()).toMatchObject({
      resource: 'https://chaindump.xyz/api/agent',
      authorization_servers: ['https://login.example.test'],
      scopes_supported: ['agent:read'],
      bearer_methods_supported: ['header'],
    });
  });

  it('ships a DNS-AID manifest with the required SVCB parameters and honest publication status', () => {
    const zone = readFileSync(new URL('../ops/dns/dns-aid.zone', import.meta.url), 'utf8');
    expect(zone).toContain('_index._agents SVCB 1');
    expect(zone).toContain('alpn="h2"');
    expect(zone).toContain('port=443');
    const runbook = readFileSync(new URL('../docs/dns-aid.md', import.meta.url), 'utf8');
    expect(runbook).toContain('manifest and verification runbook only');
    expect(runbook).toContain('DNSSEC');
  });

  it('registers only read-only WebMCP tools and aborts stale registrations', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('document.modelContext');
    expect(html).toContain('navigator.modelContext');
    expect(html).toContain('registerTool');
    expect(html).toContain('provideContext');
    expect(html).toContain('new AbortController()');
    expect(html).toContain('readOnlyHint: true');
    expect(html).toContain('pagehide');
    expect(html).toContain('chaindump_market_summary');
    expect(html).toContain('chaindump_chain_profile');
    expect(html).toContain('chaindump_signals');
    expect(html).toContain('chaindump_trace_lookup');
    expect(html).not.toMatch(/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  });
});
