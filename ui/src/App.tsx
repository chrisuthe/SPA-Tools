import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import LiveData from './views/LiveData';
import Dtcs from './views/Dtcs';
import Config from './views/Config';
import Scanner from './views/Scanner';
import { api } from './api';
import type { StatusResponse } from './types';

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    const interval = setInterval(() => {
      api.status().then(setStatus).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <Sidebar status={status} />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<LiveData />} />
          <Route path="/dtc" element={<Dtcs />} />
          <Route path="/config" element={<Config />} />
          <Route path="/scanner" element={<Scanner />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
