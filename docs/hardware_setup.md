# Hardware Setup Guide

## What You Have

| Item | Part Number | Status |
|------|------------|--------|
| VOE Ethernet adapter | 9513321 | ✅ In hand (same as 9513372) |
| USB-to-Ethernet adapter | Any Realtek-based | ❌ Still needed (~$15-20) |

The 9513321 is the correct adapter. Volvo updated the part number to 9513372
but it is the same hardware.

---

## Physical Setup

```
[Laptop]
   │
   │ USB
   ▼
[USB-to-Ethernet adapter]   ← dedicated to car, NOT internet
   │
   │ Cat5e/Cat6 patch cable
   ▼
[VOE adapter — RJ45 end]
   │
   │ (passive cable + 510Ω resistor internally)
   ▼
[VOE adapter — OBD-II end] ──── plugs into OBD-II port under dash
                                          │
                                 [Vehicle VCM / DoIP gateway]
```

---

## Network Configuration

### Step 1: Connect hardware
- Plug VOE adapter into vehicle OBD-II port
- Connect RJ45 end of VOE to USB-Ethernet adapter
- Turn vehicle ignition to RUN (or ACC minimum)

### Step 2: Configure the USB-Ethernet NIC

**Windows:**
- Settings → Network & Internet → Change adapter options
- Right-click the USB-Ethernet adapter → Properties → IPv4
- Set to "Obtain an IP address automatically" (DHCP)
- If DHCP doesn't work, try static: `169.254.1.10 / 255.255.0.0`

**Linux:**
```bash
sudo dhclient <interface>         # try DHCP first
# If that fails:
sudo ip addr add 169.254.1.10/16 dev <interface>
sudo ip link set <interface> up
```

### Step 3: Verify
```bash
python -m cli.main discover
```

If it finds the vehicle, you're good. If not, see Troubleshooting below.

---

## Ignition States

| State | DoIP Available | Recommendation |
|-------|---------------|----------------|
| Off | No | VCM not powered |
| ACC | Usually | Works for most diagnostics |
| Run (engine off) | Yes | **Best for diagnostic work** |
| Run (engine on) | Yes | Avoid for config writes |

Use ignition RUN with engine off for all diagnostic and config work.
This powers all modules fully without vibration or engine management activity.

---

## Troubleshooting

**"No SPA vehicle found on network"**
- Is ignition in RUN or ACC?
- Is VOE adapter fully seated in OBD-II port? (clicks in)
- Is the Ethernet cable plugged into the USB-Ethernet adapter, not the laptop's built-in NIC?
- Try: `python -m cli.main discover --timeout 10`
- Check fuse F35 (5A) — powers the VCM DoIP circuit on XC90

**"Connection refused on port 13400"**
- VCM is responding to UDP discovery but rejecting TCP
- Cycle ignition off and back on
- Ensure no other software (VIDA, VDASH) has the port open simultaneously

**"Session drops mid-operation"**
- Keepalive (TesterPresent) thread may be failing
- Increase request timeout or reduce poll interval
- Check Ethernet cable connection — a loose RJ45 is the most common cause

**VCM completely unresponsive**
- Check fuse F35 (5A) in instrument panel fuse box
- VCM failure is common on 2016-2018 XC90 (3G modem end-of-life)
- With a dead VCM, Ethernet OBD is unavailable
- Fallback: DiCE adapter + VIDA software for CAN-based diagnostics

---

## Wireshark Setup (Security Research)

For capturing seed/key pairs during VIDA sessions:

1. Download Wireshark: https://www.wireshark.org/
2. Run as Administrator (needed to capture on all NICs)
3. Start capture on the USB-Ethernet adapter interface
4. Filter: `tcp.port == 13400`
5. Start VIDA and trigger a software update or config write
6. Stop capture after the operation completes
7. Look for `0x67 01` (seed) and `0x27 02` (key) in the stream

See docs/security_research.md for full capture and analysis methodology.
