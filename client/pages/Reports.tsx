import { useEffect, useState } from 'react';
import { api, fmtMAD, today } from '../api';
export default function Reports() {
  const [from, setFrom] = useState(today()); const [to, setTo] = useState(today());
  const [kpis, setKpis] = useState<any>(null); const [rows, setRows] = useState<any[]>([]);
  const [out, setOut] = useState<any[]>([]); const [err, setErr] = useState('');
  useEffect(() => {
    const q = `from=${from}&to=${to}`;
    Promise.all([api('/reports/kpis?' + q), api('/reports/revenue?' + q), api('/reports/outstanding')])
      .then(([k, r, o]) => { setKpis(k); setRows(r); setOut(o); }).catch(e => setErr(e.message));
  }, [from, to]);
  function downloadCSV() {
    const header = 'date,mode,montant_mad,nombre\n';
    const body = rows.map(r => `${r.date},${r.method},${(r.cents / 100).toFixed(2)},${r.count}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `recettes-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6">
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Indicateurs de performance</h2>
        <div className="flex gap-3 mb-4 items-end">
          <div><label className="label">Du</label><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="label">Au</label><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4"><div className="text-xs uppercase text-navy-900/50">Taux d'occupation</div>
              <div className="font-display text-2xl mt-1">{kpis.occupancyRate.toFixed(1)} %</div>
              <div className="text-xs text-navy-900/50 mt-1">{kpis.occupiedNights} / {kpis.availableNights} nuitées</div></div>
            <div className="card p-4"><div className="text-xs uppercase text-navy-900/50">ADR</div>
              <div className="font-display text-2xl mt-1">{fmtMAD(kpis.adrCents)}</div>
              <div className="text-xs text-navy-900/50 mt-1">Prix moyen par nuitée vendue</div></div>
            <div className="card p-4"><div className="text-xs uppercase text-navy-900/50">RevPAR</div>
              <div className="font-display text-2xl mt-1">{fmtMAD(kpis.revparCents)}</div>
              <div className="text-xs text-navy-900/50 mt-1">Recette par nuitée disponible</div></div>
            <div className="card p-4"><div className="text-xs uppercase text-navy-900/50">Recettes hébergement</div>
              <div className="font-display text-2xl mt-1">{fmtMAD(kpis.roomRevenueCents)}</div>
              <div className="text-xs text-navy-900/50 mt-1">{kpis.daysInRange} nuits × {kpis.activeRooms - kpis.oosRooms} chambres</div></div>
          </div>
        )}
      </div>
      <div className="card p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-display text-lg">Recettes par période</h2>
          <button className="btn-ghost" onClick={downloadCSV}>Exporter CSV</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-900/60">
            <tr><th className="py-2">Date</th><th>Mode</th><th>Montant</th><th>Nombre</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-900/5">
            {rows.map((r, i) => <tr key={i}><td className="py-2">{r.date}</td><td>{r.method}</td><td>{fmtMAD(r.cents)}</td><td>{r.count}</td></tr>)}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-sm text-navy-900/50 py-4">Aucun paiement sur la période.</div>}
      </div>
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Encours clients</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-900/60">
            <tr><th className="py-2">Référence</th><th>Client</th><th>Total</th><th>Payé</th><th>Solde</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-900/5">
            {out.map(r => <tr key={r.id}><td className="py-2">{r.reference}</td><td>{r.first_name} {r.last_name}</td><td>{fmtMAD(r.totalCents)}</td><td>{fmtMAD(r.paidCents)}</td><td>{fmtMAD(r.balanceCents)}</td></tr>)}
          </tbody>
        </table>
        {out.length === 0 && <div className="text-sm text-navy-900/50 py-4">Aucun encours.</div>}
      </div>
    </div>
  );
}