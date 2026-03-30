"""
protocol/
UDS (ISO-14229) service layer on top of the DoIP transport.

Services used:
  0x10  DiagnosticSessionControl  - switch to extended/programming session
  0x11  ECUReset                  - reset a module
  0x14  ClearDiagnosticInformation - clear DTCs
  0x19  ReadDTCInformation        - read stored fault codes
  0x22  ReadDataByIdentifier      - read a DID value (live data, config)
  0x23  ReadMemoryByAddress       - read raw ECU memory (tune)
  0x27  SecurityAccess            - seed/key challenge for write access
  0x2E  WriteDataByIdentifier     - write a DID value (config change)
  0x34  RequestDownload           - start flash write session
  0x3E  TesterPresent             - keepalive during long operations
"""
