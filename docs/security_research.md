# Security Research Notes

## Summary

Reading data and clearing DTCs is achievable today with no security access.
Writing configuration (CEM parameters) and ECM flashing require security keys
that are not yet publicly known for SPA.

---

## Security Levels

### Level 0x01 — Programming (ECM Flash)
- **Status:** Algorithm UNKNOWN
- **Required for:** ECM binary read/write, module firmware update
- **Session:** Programming session (0x10 → 0x02)

### Level 0x03 — Extended Config (CEM PIN)
- **Status:** CEM PIN decodable via OBD timing attack for most non-iCUP models
  (VDASH / VDD tools), but the actual UDS algorithm is not public
- **Required for:** CEM configuration parameter writes

---

## What We Know

### Transport layer — SOLVED
- DoIP connection confirmed working via `python-doipclient`
- Tester address `0x0E80` confirmed on live SPA vehicle
- Seed capture possible: `0x27` request returns a seed from the ECU

### Seed/key capture path — VIABLE
- Volvo patched VIDA log `[Crypt]` lines — no longer readable
- Previous path: capture `[Crypt]` → 3DES decrypt (hardcoded key in VIDA software)
- **New path: live Wireshark capture during active VIDA programming session**

### SPC5646B / SPC5748G (CEM chips) — Hardware path available
- NXP/Freescale PowerPC architecture
- JTAG accessible via OSJTAG programmer (~$200)
- Bench read extracts seed/key derivation function directly from firmware
- volvo-fix.com does this commercially for CEM PIN recovery

---

## Research Methodology

### Step 1: Seed Capture via Wireshark

```
Filter: tcp.port == 13400

Seed response:   67 01 XX XX XX XX
                 ↑     ↑ ↑---------↑
                 pos   │ 4-byte seed
                       level 1

Key request:     27 02 XX XX XX XX
                 ↑     ↑ ↑---------↑
                 svc   │ 4-byte key
                       sendKey
```

Steps:
1. Start Wireshark on USB-Ethernet NIC before launching VIDA
2. VOE adapter connected, ignition in RUN
3. Launch VIDA, connect to vehicle
4. Trigger a software update or config write operation
5. After completion, stop capture and filter `tcp.port == 13400`
6. Find `67 01` (seed) and `27 02` (key) exchanges
7. Record pairs — aim for 50+ across multiple sessions

### Step 2: Statistical Analysis

```python
# Analysis approaches to try against collected pairs:

# 1. XOR with constant
for const in range(0, 0xFFFFFFFF):
    if seed ^ const == key:
        print(f"XOR constant: {const:#010x}")

# 2. Rotation
for n in range(1, 32):
    rotated = (seed >> n) | (seed << (32 - n)) & 0xFFFFFFFF
    if rotated == key:
        print(f"Right-rotate by {n}")

# 3. CRC32
import zlib
if zlib.crc32(seed.to_bytes(4, 'big')) & 0xFFFFFFFF == key:
    print("CRC32 match")

# 4. RSA (if 128-byte modulus found in firmware)
# key == pow(seed, exponent, modulus)
```

### Step 3: Firmware Extraction (if statistical analysis fails)

**CEM via JTAG (SPC5646B / SPC5748G):**
- Remove CEM from vehicle
- Connect OSJTAG programmer to JTAG test points on CEM PCB
- Dump full flash (PowerPC e200 core)
- Load into Ghidra with PowerPC e200 plugin
- Search for UDS 0x27 service handler → locate key derivation function

**ECM via Renesas programmer (R5F72546R):**
- Similar bench approach
- RH850 debug interface may need bypass
- Voltage glitching documented for similar Renesas parts

---

## Progress Log

| Date | Finding |
|------|---------|
| 2026-03 | Project started. |
| 2026-03 | DoIP transport confirmed working (`python-doipclient`). |
| 2026-03 | Tester address `0x0E80` confirmed for SPA. |
| 2026-03 | VIDA `[Crypt]` capture confirmed patched by Volvo. |
| 2026-03 | Wireshark live capture identified as primary path forward. |
| TBD | First seed/key pairs captured from VIDA session. |
| TBD | Algorithm identified via statistical analysis. |
| TBD | Security access implemented in `protocol/uds.py`. |

---

## Community Resources

- **v-spa.net** — Deepest SPA-specific community RE work
- **nefariousmotorsports.com** — General automotive ECU RE forum, seed-key thread
- **github.com/jacobschaer/python-doipclient** — DoIP library, issue #2 confirms SPA
- **d5t5.com/article/volvo_pin_codes_explained** — Authoritative PIN/security overview
- **SwedeSpeed VCM connectivity thread** — Practical SPA DoIP experience
