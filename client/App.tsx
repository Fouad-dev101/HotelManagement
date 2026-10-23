import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import Layout from './Layout';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Rooms from './pages/Rooms';
import Guests from './pages/Guests';
import Reservations from './pages/Reservations';
import ReservationDetail from './pages/ReservationDetail';
import Housekeeping from './pages/Housekeeping';
import Maintenance from './pages/Maintenance';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Calendar from './pages/Calendar';

export default function App() {
  const [state, setState] = useState<'loading'|'no-setup'|'no-auth'|'ready'>('loading');
  const nav = useNavigate();

  async function refresh() {
    const s = await api<{ needsSetup: boolean }>('/setup/status');
    if (s.needsSetup) return setState('no-setup');
    const me = await api<{ user: any }>('/auth/me');
    setState(me.user ? 'ready' : 'no-auth');
  }
  useEffect(() => { refresh().catch(() => setState('no-auth')); }, []);

  if (state === 'loading') return <div className="p-10 text-navy-900/60">Chargement…</div>;
  if (state === 'no-setup') return <Setup onDone={() => { setState('ready'); nav('/'); }} />;
  if (state === 'no-auth') return <Login onDone={() => { setState('ready'); nav('/'); }} />;

  return (
    <Routes>
      <Route element={<Layout onLogout={() => setState('no-auth')} />}>
        <Route index element={<Dashboard />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="guests" element={<Guests />} />
        <Route path="reservations" element={<Reservations />} />
        <Route path="reservations/:id" element={<ReservationDetail />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="housekeeping" element={<Housekeeping />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}