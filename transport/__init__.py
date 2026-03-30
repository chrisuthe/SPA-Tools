"""
transport/
Handles the physical DoIP connection to the vehicle via the VOE Ethernet adapter.

Key facts for Volvo SPA:
  - Tester logical address: 0x0E80  (confirmed, community RE)
  - VCM (gateway) IP: discovered via DoIP UDP broadcast
  - Protocol: ISO-13400-2 (DoIP) over TCP port 13400
  - Adapter: Volvo VOE 9513108 / 9513321 / 9513372 (OBD-II to RJ45)

Usage:
    from transport.doip import SPAConnection
    conn = SPAConnection.discover()
    with conn:
        connector = conn.get_uds_connector()
"""
