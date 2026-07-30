# DNS-AID publication runbook

The DNS-AID manifest in `ops/dns/dns-aid.zone` is not proof that DNS is live.
The authoritative zone must contain the SVCB records, and a validating resolver
must return the record with the `AD` (Authenticated Data) bit set.

## Current permission audit (2026-07-30)

The GCP Secret Manager secret `arkova1/Chaindump_Cloudflare` is available to
the deploy environment and its token is active. It can list the zone
`chaindump.xyz` (`e0db1713017f5da643066c2d2aa54bf4`), but the token's returned
permissions are only `#worker:read`, `#worker:edit`, and `#zone:read`.
It does not have `#dns_records:read`/`#dns_records:edit` or DNSSEC permission;
Cloudflare returns API error `10000 Authentication error` for both
`GET /zones/e0db1713017f5da643066c2d2aa54bf4/dns_records` and
`GET /zones/e0db1713017f5da643066c2d2aa54bf4/dnssec`.

Grant a dedicated token (preferred) or update the secret with:

- Zone:Read
- DNS Records:Edit
- DNSSEC:Edit (only if enabling DNSSEC through the API)

Do not put the token or a DNSSEC private key in git. The GitHub secret name is
`CLOUDFLARE_API_TOKEN`; the value is never logged by the workflow.

## Publish safely

The manual `Publish DNS-AID` workflow is dry-run by default. It performs a
permission read before mutation and is idempotent. After the token is granted,
run it with `apply_records=true`. Set `enable_dnssec=true` only when you are
ready to publish Cloudflare's returned DS record at the registrar.

For a local run using the secret manager (never echo the value):

```sh
export CLOUDFLARE_API_TOKEN="$(gcloud secrets versions access latest \
  --secret=Chaindump_Cloudflare --project=arkova1)"
node scripts/publish-dns-aid.mjs                  # plan only
DNS_AID_APPLY=true node scripts/publish-dns-aid.mjs
```

## Verify; fail closed

This command refuses success unless a validating DoH resolver returns NOERROR,
an SVCB answer containing `alpn` and an endpoint parameter, and `AD=true`:

```sh
node scripts/verify-dns-aid.mjs
```

As of the audit above, Cloudflare and Google DoH both return NXDOMAIN and
`AD=false` for `_index._agents.chaindump.xyz`; DNS-AID is therefore not live.

References: [DNS-AID Internet-Draft](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/), [RFC 9460](https://www.rfc-editor.org/rfc/rfc9460), and [Cloudflare DNS Records API](https://developers.cloudflare.com/api/resources/dns/subresources/records/).
