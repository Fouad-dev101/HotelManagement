import { useEffect, useState } from 'react';
import { api, fmtMAD } from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
export default function Dashboard() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="text-red-600">{err}</div>;
  if (!d) return <div className="text-navy-900/60">Chargement…</div>;
  const k = d.kpis;
  const cards = [
    ['Chambres totales', k.totalRooms], ['Disponibles', k.available], ['Occupées', k.occupied],
    ['À nettoyer', k.dirty + k.cleaning], ['Hors service', k.outOfService], ['Taux d\'occupation', `${k.occupancyRate} %`],
    ['Arrivées du jour', k.arrivalsToday], ['Départs du jour', k.departuresToday], ['Recettes du jour', fmtMAD(k.todayRevenueCents)],
    ['Recettes du mois', fmtMAD(k.monthRevenueCents)], ['Encours client', fmtMAD(k.outstandingCents)]
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        {cards.map(([l, v]) => (
          <div key={l as string} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-navy-900/50">{l}</div>
            <div className="font-display text-xl mt-1">{v}</div>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h2 className="font-display text-lg mb-4">Recettes (30 derniers jours)</h2>
        <div className="h-64">
          {d.revenueChart.length === 0 ? <div className="text-sm text-navy-900/50">Aucun paiement enregistré.</div> :
            <ResponsiveContainer><BarChart data={d.revenueChart.map((r: any) => ({ ...r, mad: r.cents / 100 }))}>
                <XAxis dataKey="d" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Bar dataKey="mad" fill="#C9A227" />
              </BarChart></ResponsiveContainer>}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-display text-lg mb-3">Arrivées du jour</h2>
          {d.arrivalsToday.length === 0 ? <div className="text-sm text-navy-900/50">Aucune arrivée prévue.</div> :
            <ul className="divide-y divide-navy-900/5 text-sm">{d.arrivalsToday.map((r: any) => <li key={r.id} className="py-2 flex justify-between"><span>{r.first_name} {r.last_name}</span><span className="text-navy-900/60">Ch. {r.room_number}</span></li>)}</ul>}
        </div>
        <div className="card p-5">
          <h2 className="font-display text-lg mb-3">Départs du jour</h2>
          {d.departuresToday.length === 0 ? <div className="text-sm text-navy-900/50">Aucun départ prévu.</div> :
            <ul className="divide-y divide-navy-900/5 text-sm">{d.departuresToday.map((r: any) => <li key={r.id} className="py-2 flex justify-between"><span>{r.first_name} {r.last_name}</span><span className="text-navy-900/60">Ch. {r.room_number}</span></li>)}</ul>}
        </div>
      </div>
    </div>
  );
}