# Task 18 — Block DoH/DoT Providers (Phase 2a)

**Phase:** 2 — Monitoring Coverage  
**Group:** AdGuard config  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

DNS-over-HTTPS bypasses the system resolver: Chrome, Firefox, Discord, and Android "Private DNS" can tunnel lookups to `dns.google`/`cloudflare-dns.com` and the monitor never sees them (ARCHITECTURE §11 blind spot). Blocking the *resolution* of DoH/DoT provider hostnames forces well-behaved apps to fall back to plain DNS through AdGuard.

**Scope honesty (discussed 2026-06-10):** this is a *coverage* measure, not an anti-evasion control. Malware running its own DoH endpoint is on no blocklist; catching that requires flow-level "connection with no prior DNS query" detection (Mac-as-gateway investigation mode, or Phase 5 Pi). After 2a, any device still using encrypted DNS is by definition suspicious — the block turns evasion into signal.

This cannot break AdGuard's own upstream (DoH to `dns10.quad9.net`): AdGuard reaches its upstream via `bootstrap_dns` IPs; filtering applies only to client queries.

---

## Approach

1. **Add a maintained blocklist** rather than hand-curating: *HaGeZi Encrypted DNS Servers* (DoH/DoT/DoQ endpoints, actively maintained, in AdGuard's filter registry) as filter id 3.
2. **Add explicit `user_rules`** (defense in depth + the Mozilla canary):
   - `||use-application-dns.net^` — canary domain; NXDOMAIN makes Firefox disable DoH voluntarily
   - `||dns.google^`, `||cloudflare-dns.com^`, `||mozilla.cloudflare-dns.com^`, `||one.one.one.one^`, `||dns.quad9.net^`, `||doh.opendns.com^`
3. **Apply to the live instance via the AdGuard API** (`/control/filtering/add_url`, `/control/filtering/set_rules`) — no restart.
4. **Update `adguardhome/AdGuardHome.template.yaml`** (filters + user_rules) so a fresh bootstrap reproduces the config.

## Known limitations

- DoH by hardcoded IP still bypasses (Phase 2b / Phase 5 / PCAPdroid territory)
- Android "Private DNS" set to a hostname fails closed (no internet) instead of falling back — keep it Off on monitored devices (documented in §9)

---

## Files Changed

| File | Change |
|---|---|
| `adguardhome/AdGuardHome.template.yaml` | Add encrypted-DNS filter + user_rules |
| (live AdGuard instance) | Same changes via API |
| `ARCHITECTURE.md` | Mark Phase 2a done; note 2c done in Phase 1 (Task 11) |

---

## How to Verify

```bash
dig @127.0.0.1 dns.google +short                 # → 0.0.0.0 (blocked)
dig @127.0.0.1 use-application-dns.net +short    # → blocked
dig @127.0.0.1 example.com +short                # → real answer (control)
```

Chrome/Discord keep working (plain-DNS fallback) and their domains appear in the query log. Blocked DoH attempts generate `THREAT_MATCH` alerts — expected noise initially.

---

## Next Task

**Task 19** — Phase 2b: TLS SNI extraction, or Phase 5-lite (Mac-as-gateway investigation mode) — user's choice.
