export interface StatusResponse {
  connected: boolean;
  vcm_ip: string | null;
  vcm_logical_addr: string | null;
  tester_addr: string;
  vehicle_vin: string | null;
  session_type: string;
}

export interface ModuleStatus {
  name: string;
  full_name: string;
  logical_address: string | null;
  dtc_count: number;
  responding: boolean;
}

export interface DTC {
  module: string;
  code: string;
  display: string;
  description: string;
  status: number;
}

export interface ConfigParam {
  param: string;
  did: number;
  raw: string;
  value: number | boolean;
  unit: string;
}

export interface LiveReading {
  name: string;
  did: string;
  value: number | null;
  unit: string;
  error: string | null;
  timestamp: number;
}

export interface ScanProgress {
  current_did: string;
  percent: number;
  found_count: number;
  complete?: boolean;
}

export interface ScanResult {
  running: boolean;
  total_responsive: number;
  results: Record<string, string>;
}
