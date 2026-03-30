import type { StatusResponse, ModuleStatus, DTC, ConfigParam, ScanResult } from './types';

const BASE = 'http://127.0.0.1:8384';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  connect: (ip?: string) => request<StatusResponse>('POST', '/api/connect', { ip }),
  disconnect: () => request<StatusResponse>('DELETE', '/api/connect'),
  status: () => request<StatusResponse>('GET', '/api/status'),
  modules: () => request<ModuleStatus[]>('GET', '/api/modules'),
  dtcReadAll: () => request<DTC[]>('GET', '/api/dtc'),
  dtcClear: (module: string) => request<unknown>('DELETE', `/api/dtc/${module}`),
  configRead: (module: string) => request<ConfigParam[]>('GET', `/api/config/${module}`),
  configWrite: (module: string, param: string, value: unknown) =>
    request<unknown>('PUT', `/api/config/${module}/${param}`, { value }),
  enterEditMode: () => request<{ edit_mode: boolean }>('POST', '/api/config/edit-mode'),
  exitEditMode: () => request<{ edit_mode: boolean }>('DELETE', '/api/config/edit-mode'),
  startScan: (start: number, end: number) =>
    request<unknown>('POST', '/api/scan', { start, end }),
  stopScan: () => request<unknown>('DELETE', '/api/scan'),
  scanResults: () => request<ScanResult>('GET', '/api/scan/results'),
};
