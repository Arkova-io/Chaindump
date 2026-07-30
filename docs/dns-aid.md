# DNS-AID publication plan

Status: **manifest and verification runbook only**. The Worker cannot publish
authoritative DNS records. Do not mark DNS-AID as live until these records are
created in the `chaindump.xyz` DNS zone and DNSSEC validation succeeds.

DNS-AID is an Internet-Draft (not yet an RFC) that uses SVCB/HTTPS records to
advertise an agent endpoint. The record below advertises the public
Chaindump agent surface over HTTPS. The MCP service is listed separately so a
client can choose the protocol it supports.

## Records to publish

Import `ops/dns/dns-aid.zone` into the authoritative DNS provider, or create
the equivalent SVCB records manually:

```dns
_index._agents.chaindump.xyz. 3600 IN SVCB 1 chaindump.xyz. alpn="h2" port=443 mandatory=alpn,port
_mcp._agents.chaindump.xyz.   3600 IN SVCB 1 chaindump-mcp-270018525501.us-central1.run.app. alpn="h2" port=443 mandatory=alpn,port
```

The first record points agents to `/.well-known/agent-skills/index.json` and
the API catalog on the primary domain. The second points at the existing
streamable-HTTP MCP endpoint advertised by the site's MCP server card. If the
MCP service hostname or protocol changes, update both this manifest and the
server card together.

## DNSSEC and verification

1. Enable DNSSEC for the `chaindump.xyz` zone at the authoritative provider.
2. Publish the provider's DS record at the registrar; do not commit a private
   signing key to this repository.
3. Query the records through a validating resolver and require the `ad` flag:

   ```sh
   dig +dnssec _index._agents.chaindump.xyz SVCB @1.1.1.1
   dig +dnssec _mcp._agents.chaindump.xyz SVCB @1.1.1.1
   ```

4. Verify the endpoint and its HTTPS metadata:

   ```sh
   curl -fsS https://chaindump.xyz/.well-known/agent-skills/index.json
   curl -fsS https://chaindump.xyz/.well-known/api-catalog
   curl -fsS https://chaindump.xyz/.well-known/mcp/server-card.json
   ```

The DNS-AID scanner uses DNS-over-HTTPS and requires a discoverable SVCB/HTTPS
record with `alpn` and endpoint parameters. A zone file committed here is not
proof of publication; rerun the scanner only after the authoritative zone and
DNSSEC checks above pass.

References: [DNS-AID Internet-Draft](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/), [RFC 9460](https://www.rfc-editor.org/rfc/rfc9460).
