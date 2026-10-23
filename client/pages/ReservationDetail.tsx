import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtMAD } from '../api';
export default function ReservationDetail() {
  const { id } = useParams(); const [d, setD] = useState<any>(null); const [services, setServices] = useState<any[]>([]);
  const [svc, setSvc] = useState({ serviceId: '', quantity: 1 });
  const [pay, setPay] = useState({ amountCents: 0, method: 'cash', reference: '' });
  const [err, setErr] = useState('');
  async function load() { setD(await api('/reservations/' + id)); setServices(await api('/services')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, [id]);
  if (err && !d) return <div className="text-red-600">{err}</div>;
  if (!d) return <div className="text-navy-900/60">Chargement…</div>;
  const r = d.reservation; const t = d.totals;
  async function act(path: string, body?: any) {
    try { setErr(''); await api(path, { method: 'POST', body }); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-display text-2xl">{r.reference}</div>
            <div className="text-sm text-navy-900/60">{r.first_name} {r.last_name} · Ch. {r.room_number}</div>
            <div className="text-sm mt-1">{r.check_in} → {r.check_out} · Statut : <b>{r.status}</b></div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-navy-900/50">Total</div>
            <div className="font-display text-xl">{fmtMAD(t.totalCents)}</div>
            <div className="text-xs text-navy-900/60">Payé : {fmtMAD(t.paidCents)} · Solde : {fmtMAD(t.balanceCents)}</div>
          </div>
        </div>
        {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
        <div className="flex flex-wrap gap-2 mt-4">
          {r.status === 'pending' && <button className="btn-ghost" onClick={() => act(`/reservations/${id}/confirm`)}>Confirmer</button>}
          {['pending','confirmed'].includes(r.status) && <button className="btn-primary" onClick={() => act(`/reservations/${id}/check-in`)}>Check-in</button>}
          {r.status === 'in_progress' && <button className="btn-primary" onClick={() => act(`/reservations/${id}/check-out`)}>Check-out</button>}
          {!['completed','cancelled'].includes(r.status) && <button className="btn-ghost" onClick={() => act(`/reservations/${id}/cancel`)}>Annuler</button>}
          {d.invoice && <a className="btn-gold" href={`/api/invoices/${d.invoice.id}/print`} target="_blank" rel="noreferrer">Facture {d.invoice.number}</a>}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-display text-lg mb-3">Services</h2>
          <form className="flex gap-2 mb-3" onSubmit={async e => {
            e.preventDefault();
            await act(`/reservations/${id}/services`, { serviceId: Number(svc.serviceId), quantity: Number(svc.quantity) });
            setSvc({ serviceId: '', quantity: 1 });
          }}>
            <select className="input" value={svc.serviceId} onChange={e => setSvc({ ...svc, serviceId: e.target.value })} required>
              <option value="">Service…</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} — {fmtMAD(s.price_cents)}</option>)}
            </select>
            <input className="input w-20" type="number" min={1} value={svc.quantity} onChange={e => setSvc({ ...svc, quantity: Number(e.target.value) })} />
            <button className="btn-primary">Ajouter</button>
          </form>
          <ul className="text-sm divide-y divide-navy-900/5">
            {d.services.map((s: any) => <li key={s.id} className="py-2 flex justify-between"><span>{s.name} × {s.quantity}</span><span>{fmtMAD(s.quantity * s.unit_price_cents)}</span></li>)}
            {d.services.length === 0 && <li className="py-2 text-navy-900/50">Aucun service.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-display text-lg mb-3">Paiements</h2>
          <form className="grid grid-cols-3 gap-2 mb-3" onSubmit={async e => {
            e.preventDefault();
            await act(`/reservations/${id}/payments`, { amountCents: Number(pay.amountCents), method: pay.method, reference: pay.reference });
            setPay({ amountCents: 0, method: 'cash', reference: '' });
          }}>
            <input className="input" type="number" min={1} placeholder="Centimes" value={pay.amountCents || ''} onChange={e => setPay({ ...pay, amountCents: Number(e.target.value) })} required />
            <select className="input" value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
              <option value="cash">Espèces</option><option value="card">Carte</option>
              <option value="transfer">Virement</option><option value="other">Autre</option>
            </select>
            <button className="btn-gold">Encaisser</button>
          </form>
          <ul className="text-sm divide-y divide-navy-900/5">
            {d.payments.map((p: any) => <li key={p.id} className="py-2 flex justify-between"><span>{p.method} · {new Date(p.paid_at).toLocaleDateString('fr-FR')}</span><span>{fmtMAD(p.amount_cents)}</span></li>)}
            {d.payments.length === 0 && <li className="py-2 text-navy-900/50">Aucun paiement.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}