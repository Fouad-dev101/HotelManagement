import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, BedDouble, Users, CalendarRange, Sparkles, Wrench, BarChart3, Settings as Cog, LogOut, CalendarDays, ShieldCheck } from 'lucide-react';
import { api } from './api';

const nav = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/calendar', label: 'Planning', icon: CalendarDays },
  { to: '/rooms', label: 'Chambres', icon: BedDouble },
  { to: '/guests', label: 'Clients', icon: Users },
  { to: '/reservations', label: 'Réservations', icon: CalendarRange },
  { to: '/housekeeping', label: 'Entretien', icon: Sparkles },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/reports', label: 'Rapports', icon: BarChart3 },
  { to: '/users', label: 'Employés', icon: ShieldCheck },
  { to: '/settings', label: 'Paramètres', icon: Cog }
];

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const loc = useLocation();
  const title = nav.find(n => n.to === loc.pathname || (n.to !== '/' && loc.pathname.startsWith(n.to)))?.label ?? 'Hotelyx';
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 bg-navy-900 text-cream flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="font-display text-2xl text-gold-500">Hotelyx</div>
          <div className="text-xs text-cream/60 mt-1">Gestion hôtelière</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm ${isActive ? 'bg-white/10 text-gold-400' : 'text-cream/80 hover:bg-white/5'}`}>
              <n.icon size={16} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); }}
          className="m-3 flex items-center gap-2 px-3 py-2 text-sm text-cream/70 hover:text-white">
          <LogOut size={16} /> Déconnexion
        </button>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 bg-white border-b border-navy-900/10 flex items-center px-6 justify-between">
          <h1 className="font-display text-lg">{title}</h1>
          <div className="text-xs text-navy-900/50">MAD · Maroc</div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}