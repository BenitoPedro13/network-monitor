# Task 21 — Gateway Investigation Mode (route the phone through the Mac)

**Phase:** 5-lite (pulled forward)  
**Group:** Infrastructure  
**Status:** Pending  
**Date:** 2026-06-10

---

## What and Why

Tasks 19–20 give full flow visibility for the **Mac's own** traffic. The phone's packets still never cross the Mac (the Mac is its DNS server, not its gateway), so the phone's WebRTC, DoH-by-IP, and DNS-less connections remain invisible. Routing the phone **through** the Mac as a gateway puts its packets on `en0`, where the same Zeek sensor (Task 19) already captures everything — no new sensor, just a routing change.

**Scoped as on-demand investigation mode, not always-on.** While enabled, the phone's entire connectivity depends on the Mac being awake and running. That violates the daily-availability requirement (the AdGuard-outage lesson), so this is a deliberate "I'm investigating the phone right now" switch, reverted afterward. The Pi (full Phase 5) is the always-on version.

Personal-network context: the owner routing their own phone through their own Mac to inspect their own device's egress.

---

## Design

### `scripts/gateway-mode.sh` (on | off | status) — requires sudo

- **on:**
  - `sysctl -w net.inet.ip.forwarding=1`
  - load a pf NAT anchor: `nat on en0 from <PHONE_IP> to any -> (en0)` (masquerade the phone out the Mac's Wi-Fi)
  - load additively via a named pf anchor — do **not** clobber Apple's `/etc/pf.conf`
  - print phone-side instructions + a loud "GATEWAY MODE ON — phone depends on this Mac" reminder
- **off:**
  - flush the anchor, `sysctl -w net.inet.ip.forwarding=0`, reload system pf
  - safe to run blind (idempotent)
- **status:** show forwarding flag + whether the anchor is loaded
- `PHONE_IP` from arg or `.env` (`GATEWAY_TARGET_IP=192.168.1.21`)

### Phone-side (manual, printed by script)

Static Wi-Fi config → change **Gateway** from `192.168.1.1` to `192.168.1.6` (the Mac). DNS settings unchanged (still `192.168.1.6` primary, router fallback). **Revert the gateway when done.**

### Capture

No new code — the Task 19 Zeek sensor on `en0` now also sees `srcIp = 192.168.1.21` flows. The Task 19 mapper already keeps unknown/other-device flows (deviceId resolved from srcIp → `android-benito`), so phone flows land in `NetworkFlow` and the Task 20 dashboards/rule automatically cover them.

---

## Files Changed

| File | Change |
|---|---|
| `scripts/gateway-mode.sh` | New — on/off/status pf+forwarding toggle |
| `.env.example` | `GATEWAY_TARGET_IP` (optional) |
| `README.md` | "Investigation mode" section + revert warning |
| `ARCHITECTURE.md` | Gateway mode under Phase 5 (staged pull-forward) |

---

## Risks

| Risk | Mitigation |
|---|---|
| Phone offline if Mac sleeps/leaves while on | Investigation mode only; `off` + revert printed on enable; loud status reminder |
| pf misconfig breaks Mac networking | Named anchor (system rules untouched); `off` restores; reboot resets pf |
| Left on by accident | `status` subcommand; `on` warns; consider auto-off timer (stretch) |
| Phone IPv6 bypasses the v4 gateway | Note: may need to disable IPv6 on the phone's Wi-Fi for full capture |

---

## How to Verify

```bash
sudo scripts/gateway-mode.sh on          # set phone gateway → 192.168.1.6
sudo tcpdump -i en0 -n host 192.168.1.21 and udp and not port 53   # phone media flows visible
# confirm phone flows in NetworkFlow attributed to android-benito
sudo scripts/gateway-mode.sh off         # revert phone gateway to 192.168.1.1
```

---

## Next Task

Phase 2 flow layer complete. Future: Phase 3 (threat-intel domain feeds), Phase 5 (Pi gateway — always-on version of this, network-wide).
