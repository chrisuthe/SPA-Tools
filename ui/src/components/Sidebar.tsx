import { NavLink } from 'react-router-dom';
import type { StatusResponse } from '../types';

interface SidebarProps {
  status: StatusResponse | null;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: '\u229E' },
  { to: '/live', label: 'Live Data', icon: '\u25C9' },
  { to: '/dtc', label: 'DTCs', icon: '\u25B3' },
  { to: '/config', label: 'Config', icon: '\u2699' },
  { to: '/scanner', label: 'DID Scanner', icon: '\u2295' },
  { to: '/tune', label: 'ECU Tune', icon: '\u25C8', disabled: true },
];

export default function Sidebar({ status }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">{'\u2B21'} SPATools</span>
        {status?.vehicle_vin && (
          <span className="sidebar-vehicle">{status.vehicle_vin.slice(0, 11)}{'\u2026'}</span>
        )}
      </div>

      <div className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={'disabled' in item && item.disabled ? '#' : item.to}
            className={({ isActive }) =>
              `sidebar-link${isActive && !('disabled' in item && item.disabled) ? ' active' : ''}${'disabled' in item && item.disabled ? ' disabled' : ''}`
            }
            onClick={(e) => 'disabled' in item && item.disabled && e.preventDefault()}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className={`sidebar-status ${status?.connected ? 'connected' : ''}`}>
          <span className="status-dot">{'\u25CF'}</span>
          <span>{status?.connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {status?.connected && (
          <>
            <div className="sidebar-detail">{status.vcm_ip}</div>
            <div className="sidebar-detail">VCM {status.vcm_logical_addr}</div>
          </>
        )}
      </div>
    </nav>
  );
}
