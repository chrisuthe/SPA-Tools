"""
cli/main.py

SPATools command-line interface.

Usage:
    python -m cli.main <command> [options]
    spatools <command> [options]          # if installed via pip

Commands:
    discover        Discover vehicle on network and print module info
    live            Stream live data to terminal
    dtc read        Read DTCs from all modules
    dtc clear       Clear DTCs from a specific module
    config read     Read a configuration parameter
    config write    Write a configuration parameter (requires security access)
    scan-dids       Brute-force DID scan (research — saves to JSON)
    tune dump       Dump ECM binary (blocked pending security key RE)

Global options:
    --ip IP         VCM IP address (skip discovery)
    --log-level     DEBUG / INFO / WARNING (default: INFO)
    --timeout       DoIP discovery timeout seconds (default: 5)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
import json
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich import box

console = Console()


# ── Logging setup ──────────────────────────────────────────────────────────────

def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


# ── Shared connection helper ───────────────────────────────────────────────────

def get_connection(args):
    """Return an SPAConnection using discovery or explicit IP."""
    from transport.doip import SPAConnection
    if hasattr(args, "ip") and args.ip:
        conn = SPAConnection(ecu_ip=args.ip)
    else:
        console.print("[bold]Discovering vehicle on network...[/bold]")
        timeout = getattr(args, "timeout", 5.0)
        conn = SPAConnection.discover(timeout=timeout)
        console.print(f"[green]Found VCM at {conn.ecu_ip}[/green]")
    return conn


# ── discover ──────────────────────────────────────────────────────────────────

def cmd_discover(args) -> int:
    from transport.doip import SPAConnection
    try:
        console.print("[bold]Broadcasting DoIP discovery (UDP broadcast)...[/bold]")
        conn = SPAConnection.discover(timeout=args.timeout)
        console.print(f"\n[green bold]Vehicle found![/green bold]")
        console.print(f"  VCM IP:           {conn.ecu_ip}")
        console.print(f"  VCM logical addr: {conn.vcm_addr:#06x}")
        console.print(f"  Tester addr:      {conn.tester_addr:#06x}")

        with conn:
            try:
                status = conn.entity_status()
                console.print(f"\n[bold]DoIP Entity Status:[/bold]")
                for k, v in status.items():
                    console.print(f"  {k}: {v}")
            except Exception as e:
                console.print(f"[yellow]Entity status query failed: {e}[/yellow]")

        console.print(
            f"\n[dim]Add --ip {conn.ecu_ip} to skip discovery on next run.[/dim]"
        )
        return 0
    except ConnectionError as e:
        console.print(f"[red]Discovery failed:[/red] {e}")
        return 1


# ── live data ─────────────────────────────────────────────────────────────────

def cmd_live(args) -> int:
    from transport.doip import SPAConnection
    from protocol.session import SessionManager, SessionType
    from live_data.reader import LiveDataReader
    from live_data.pids import ALL_CANDIDATE_DIDS, ENGINE_DIDS, TRANSMISSION_DIDS
    from udsoncan.client import Client

    # Filter to requested PIDs if specified
    if hasattr(args, "pids") and args.pids:
        pid_names = {p.lower().replace(" ", "_") for p in args.pids}
        dids = [d for d in ALL_CANDIDATE_DIDS
                if d.name.lower().replace(" ", "_") in pid_names]
        if not dids:
            console.print(f"[red]No matching PIDs found for: {args.pids}[/red]")
            console.print("[dim]Available:[/dim]")
            for d in ALL_CANDIDATE_DIDS:
                console.print(f"  {d.name.lower().replace(' ', '_')}")
            return 1
    else:
        dids = ENGINE_DIDS + TRANSMISSION_DIDS

    interval = getattr(args, "interval", 1.0)
    console.print(f"[bold]Streaming {len(dids)} parameters "
                  f"(every {interval}s)[/bold]")
    console.print("[dim]Press Ctrl+C to stop[/dim]\n")

    try:
        conn = get_connection(args)
        with conn:
            connector = conn.get_uds_connector()
            with Client(connector, request_timeout=2) as uds:
                with SessionManager(uds) as session:
                    session.switch(SessionType.EXTENDED)
                    session.start_keepalive()
                    reader = LiveDataReader(uds, dids)

                    with Live(console=console, refresh_per_second=4) as live:
                        for readings in reader.poll(interval=interval):
                            table = Table(box=box.SIMPLE, show_header=True,
                                          header_style="bold")
                            table.add_column("Parameter", min_width=30)
                            table.add_column("Value", justify="right", min_width=10)
                            table.add_column("Unit", min_width=8)
                            table.add_column("DID", min_width=8)
                            table.add_column("Status", min_width=10)

                            for r in readings:
                                if r.value is not None:
                                    val_str = f"{r.value:.2f}"
                                    status_str = "[green]OK[/green]"
                                else:
                                    val_str = "—"
                                    status_str = f"[red]{r.error}[/red]"

                                table.add_row(
                                    r.did_def.name,
                                    val_str,
                                    r.did_def.unit,
                                    f"{r.did_def.did:#06x}",
                                    status_str,
                                )
                            live.update(table)

    except KeyboardInterrupt:
        console.print("\n[dim]Stopped.[/dim]")
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        logging.getLogger(__name__).exception("live data error")
        return 1
    return 0


# ── dtc read ──────────────────────────────────────────────────────────────────

def cmd_dtc_read(args) -> int:
    from transport.doip import SPAConnection
    from protocol.session import SessionManager, SessionType
    from dtc.reader import read_all_modules
    from udsoncan.client import Client

    try:
        conn = get_connection(args)
        with conn:
            connector = conn.get_uds_connector()
            with Client(connector, request_timeout=2) as uds:
                with SessionManager(uds) as session:
                    session.switch(SessionType.EXTENDED)
                    dtcs = read_all_modules(uds)

        if not dtcs:
            console.print("[green]No DTCs found across all modules.[/green]")
            return 0

        table = Table(title=f"Diagnostic Trouble Codes ({len(dtcs)} found)",
                      box=box.SIMPLE)
        table.add_column("Module", style="bold", min_width=8)
        table.add_column("Code", min_width=8)
        table.add_column("Description", min_width=50)
        table.add_column("Status", justify="right", min_width=8)

        for dtc in dtcs:
            table.add_row(
                dtc["module"],
                dtc["code"],
                dtc["description"],
                f"{dtc['status']:#04x}",
            )
        console.print(table)
        return 0

    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        return 1


# ── dtc clear ─────────────────────────────────────────────────────────────────

def cmd_dtc_clear(args) -> int:
    from transport.doip import SPAConnection
    from protocol.session import SessionManager, SessionType
    from dtc.clearer import clear_module
    from udsoncan.client import Client

    console.print(
        f"[yellow]About to clear DTCs from {args.module}. "
        f"Only do this after diagnosing the underlying faults.[/yellow]"
    )
    console.print("Press Enter to continue or Ctrl+C to cancel...")
    try:
        input()
    except KeyboardInterrupt:
        console.print("[dim]Cancelled.[/dim]")
        return 0

    try:
        conn = get_connection(args)
        with conn:
            connector = conn.get_uds_connector()
            with Client(connector, request_timeout=2) as uds:
                with SessionManager(uds) as session:
                    session.switch(SessionType.EXTENDED)
                    success = clear_module(uds, args.module)

        if success:
            console.print("[green]DTCs cleared successfully.[/green]")
        else:
            console.print("[red]Clear failed — check logs for detail.[/red]")
        return 0 if success else 1

    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        return 1


# ── config read ───────────────────────────────────────────────────────────────

def cmd_config_read(args) -> int:
    from transport.doip import SPAConnection
    from protocol.session import SessionManager, SessionType
    from config.reader import read_param, dump_all_config
    from udsoncan.client import Client

    try:
        conn = get_connection(args)
        with conn:
            connector = conn.get_uds_connector()
            with Client(connector, request_timeout=2) as uds:
                with SessionManager(uds) as session:
                    session.switch(SessionType.EXTENDED)

                    if args.param == "all":
                        results = dump_all_config(uds)
                        table = Table(title="Configuration Dump", box=box.SIMPLE)
                        table.add_column("Parameter", style="bold", min_width=25)
                        table.add_column("Value", justify="right", min_width=10)
                        table.add_column("Unit", min_width=6)
                        table.add_column("Raw (hex)", min_width=10)
                        for r in results:
                            table.add_row(
                                r["param"], str(r["value"]),
                                r.get("unit", ""), r["raw"]
                            )
                        console.print(table)
                    else:
                        result = read_param(uds, args.param)
                        if result:
                            console.print(
                                f"[bold]{result['param']}[/bold]: "
                                f"{result['value']} {result['unit']} "
                                f"(raw: {result['raw']})"
                            )
                        else:
                            console.print(
                                f"[red]Could not read '{args.param}'[/red]\n"
                                f"[dim]Check did_registry.yaml for available params.[/dim]"
                            )
                            return 1
        return 0

    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        return 1


# ── scan-dids ─────────────────────────────────────────────────────────────────

def cmd_scan_dids(args) -> int:
    from transport.doip import SPAConnection
    from protocol.session import SessionManager, SessionType
    from protocol.uds import scan_dids
    from udsoncan.client import Client

    start = int(args.start, 16) if isinstance(args.start, str) else args.start
    end   = int(args.end, 16)   if isinstance(args.end, str)   else args.end
    total = end - start + 1

    console.print(
        f"[bold]DID scan: {start:#06x} – {end:#06x} "
        f"({total} DIDs)[/bold]"
    )
    console.print("[dim]Results saved to did_scan_results.json — "
                  "please submit to the project![/dim]\n")

    found: dict[str, str] = {}

    def progress(did, _total):
        if did % 0x20 == 0:
            pct = (did - start) / total * 100
            console.print(
                f"  {did:#06x}  {pct:5.1f}%  "
                f"[green]{len(found)} found[/green]",
                end="\r"
            )

    try:
        conn = get_connection(args)
        with conn:
            connector = conn.get_uds_connector()
            with Client(connector, request_timeout=1) as uds:
                with SessionManager(uds) as session:
                    session.switch(SessionType.EXTENDED)
                    session.start_keepalive()
                    raw = scan_dids(uds, start, end, progress_cb=progress)
                    found = {f"{did:#06x}": data.hex()
                             for did, data in raw.items()}

        output = Path("did_scan_results.json")
        payload = {
            "vehicle": "TODO: add your VIN and model year",
            "scan_range": f"{start:#06x}-{end:#06x}",
            "total_responsive": len(found),
            "results": found,
        }
        output.write_text(json.dumps(payload, indent=2))
        console.print(
            f"\n[green]Found {len(found)} responsive DIDs. "
            f"Saved to {output}[/green]"
        )
        console.print(
            "[bold]Please submit these to the project "
            "(see docs/contributing_dids.md)![/bold]"
        )
        return 0

    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        return 1


# ── Argument parser ────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="spatools",
        description="Volvo SPA platform diagnostic and tuning toolkit",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--ip",
                        help="VCM IP address (skip network discovery)")
    parser.add_argument("--timeout", type=float, default=5.0,
                        help="DoIP discovery timeout in seconds (default: 5)")
    parser.add_argument("--log-level", default="INFO",
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        help="Logging verbosity (default: INFO)")

    subs = parser.add_subparsers(dest="command", metavar="command")

    # discover
    subs.add_parser(
        "discover",
        help="Discover vehicle on network and show DoIP entity status"
    )

    # live
    live_p = subs.add_parser("live", help="Stream live sensor data to terminal")
    live_p.add_argument(
        "--pids", nargs="*",
        help="PID names to stream (default: all engine + TCM). "
             "Use underscores: coolant_temperature, current_gear"
    )
    live_p.add_argument(
        "--interval", type=float, default=1.0,
        help="Poll interval in seconds (default: 1.0)"
    )

    # dtc
    dtc_p = subs.add_parser("dtc", help="Fault code operations")
    dtc_sub = dtc_p.add_subparsers(dest="dtc_command", metavar="subcommand")
    dtc_sub.add_parser("read", help="Read DTCs from all modules")
    dtc_clear_p = dtc_sub.add_parser("clear", help="Clear DTCs from a module")
    dtc_clear_p.add_argument(
        "--module", required=True,
        help="Module name (e.g. CEM, ECM, ABS_BCM)"
    )

    # config
    cfg_p = subs.add_parser("config", help="Module configuration")
    cfg_sub = cfg_p.add_subparsers(dest="config_command", metavar="subcommand")
    cfg_read_p = cfg_sub.add_parser("read", help="Read a config parameter")
    cfg_read_p.add_argument(
        "--param", required=True,
        help="Parameter name from did_registry.yaml, or 'all' for full dump"
    )
    cfg_write_p = cfg_sub.add_parser(
        "write",
        help="Write a config parameter (requires security access — not yet available)"
    )
    cfg_write_p.add_argument("--param", required=True)
    cfg_write_p.add_argument("--value", required=True)

    # scan-dids
    scan_p = subs.add_parser(
        "scan-dids",
        help="Brute-force DID scan for research (results saved to JSON)"
    )
    scan_p.add_argument(
        "--start", default="0xDD00",
        help="Start DID in hex (default: 0xDD00)"
    )
    scan_p.add_argument(
        "--end", default="0xDDFF",
        help="End DID in hex (default: 0xDDFF)"
    )

    # tune
    tune_p = subs.add_parser(
        "tune",
        help="ECU tune operations (research phase — blocked pending security RE)"
    )
    tune_sub = tune_p.add_subparsers(dest="tune_command", metavar="subcommand")
    tune_sub.add_parser("dump", help="Dump ECM binary to file")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    setup_logging(getattr(args, "log_level", "INFO"))

    match args.command:
        case "discover":
            return cmd_discover(args)

        case "live":
            return cmd_live(args)

        case "dtc":
            match getattr(args, "dtc_command", None):
                case "read":
                    return cmd_dtc_read(args)
                case "clear":
                    return cmd_dtc_clear(args)
                case _:
                    console.print("[red]Specify a subcommand: read | clear[/red]")
                    return 1

        case "config":
            match getattr(args, "config_command", None):
                case "read":
                    return cmd_config_read(args)
                case "write":
                    console.print(
                        "[yellow]Config write requires security access — "
                        "not yet implemented.[/yellow]\n"
                        "[dim]See docs/security_research.md[/dim]"
                    )
                    return 1
                case _:
                    console.print("[red]Specify a subcommand: read | write[/red]")
                    return 1

        case "scan-dids":
            return cmd_scan_dids(args)

        case "tune":
            console.print(
                "[yellow]ECU tune operations are in research phase.[/yellow]\n"
                "[dim]Security level 1 key required — see docs/security_research.md[/dim]"
            )
            return 1

        case _:
            parser.print_help()
            return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
