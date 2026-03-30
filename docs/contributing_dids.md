# Contributing DID Discoveries

The biggest gap in SPATools right now is verified DID addresses — which
specific hex identifiers Volvo assigned to "coolant temp", "current gear",
"boost pressure", etc. on SPA.

Every SPA owner who runs a scan and submits results helps build this map.

---

## Quick Start

```bash
# Scan the most likely engine data range (~256 DIDs, ~5-10 minutes)
python -m cli.main scan-dids --start 0xDD00 --end 0xDDFF

# Scan transmission range
python -m cli.main scan-dids --start 0xDE00 --end 0xDEFF

# Scan standard ISO range (VIN, software versions)
python -m cli.main scan-dids --start 0xF100 --end 0xF1FF

# Full scan — takes 30-60 minutes
python -m cli.main scan-dids --start 0x0000 --end 0xFFFF
```

Results save to `did_scan_results.json` in your working directory.

---

## Identifying What a DID Does

After scanning you'll have DIDs with raw hex values. To figure out what each is:

**Temperature sensors:** Run scan cold (before starting car) and again warm.
DIDs that change by ~80 raw counts between runs are temperature sensors (the
-40 offset means 80 raw = 80°C change).

**RPM:** Rev the engine in Park. A DID tracking rapidly with engine speed is RPM.

**Gear:** Put car in manual mode, step through each gear. One DID will show
0/1/2/3/4/5/6/7/8/R.

**Boost:** Run the scan at idle vs light throttle. A DID near 1013 (raw, = 101.3 kPa
atmospheric) at idle that rises under boost is manifold pressure.

**Config vs live:** Scan twice in very different conditions (cold start vs warm,
parked vs moving). DIDs that never change between runs are likely config/info
fields, not live sensor data.

---

## Submitting Results

### Option 1: Pull Request (preferred)

Add your confirmed DID to `module_map/did_registry.yaml`:

```yaml
your_parameter_name:
  did: 0xDDxx          # confirmed hex address
  name: "Human readable name"
  module: ECM          # which module you queried
  type: uint8          # uint8 / uint16 / uint32 / bool / ascii
  length: 1            # bytes in response
  unit: "C"            # physical unit
  scale: 1.0           # multiply raw value by this
  offset: -40.0        # add after scaling
  range: [-40, 215]    # expected real-world range
  status: confirmed    # confirmed / candidate / unknown
  notes: >
    Verified on 2019 XC90 T6 B4204T27.
    Raw 0x69 at 65°C coolant (105 * 1.0 - 40 = 65). ✓
```

### Option 2: Open an issue

Attach your `did_scan_results.json` and include:
- **Vehicle:** Year, Model, Powertrain (e.g. "2019 XC90 T6")
- **Engine code:** e.g. B4204T27 (from VIDA or door jamb sticker)
- **Conditions:** Cold / warm idle / under load / etc.

---

## Most Wanted DIDs

| Parameter | Module | Priority |
|---|---|---|
| Engine coolant temperature | ECM | 🔴 High |
| Current engaged gear | TCM | 🔴 High |
| Turbo boost pressure | ECM | 🔴 High |
| Engine oil temperature | ECM | 🟡 Medium |
| ATF temperature | TCM | 🟡 Medium |
| 12V battery voltage | CEM | 🟡 Medium |
| Throttle position | ECM | 🟢 Nice to have |

---

## Vehicle Variants

DID addresses may differ between:
- **Model years** — 2016-2018 vs 2019+ may have different software builds
- **Powertrains** — T5 (B4204T23) vs T6 (B4204T27) vs T8 vs diesel
- **Markets** — EU and US sometimes have different software versions

Always include your vehicle details. The more variants we cover, the better.
