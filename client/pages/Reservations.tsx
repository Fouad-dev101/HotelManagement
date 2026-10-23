import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, today } from '../api';
export default function Reservations() {
  const [list, setList] = useState<any[]>([]); const [guests, setGuests] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [f, setF] = useState<any>({ guestId: '', roomId: '', checkIn: today(), checkOut: today(), adults: 1, children: 0, nightlyRateCents: 80000, discountCents: 0, status: 'pending' });
  const [err, setErr] = useState('');
  async function load() { setList(await api('/reservations')); setGuests(await api('/guests')); setRooms(await api('/rooms')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Nouvelle réservation</h2>
        <form className="grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={async e => {
          e.preventDefault(); setErr('');
          try {
            await api('/reservations', { body: {
              guestId: Number(f.guestId), roomId: Number(f.roomId),
              checkIn: f.checkIn, checkOut: f.checkOut,
              adults: Number(f.adults), children: Number(f.children),
              nightlyRateCents: Number(f.nightlyRateCents), discountCents: Number(f.discountCents),
              status: f.status
            }});
            await load();
          } catch (e: any) { setErr(e.message); }
        }}>
          <div><label className="label">Client</label>
            <select className="input" value={f.guestId} onChange={e => setF({ ...f, guestId: e.target.value })} required>
              <option value="">—</option>{guests.map((g: any) => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
            </select></div>
          <div><label className="label">Chambre</label>
            <select className="input" value={f.roomId} onChange={e => setF({ ...f, roomId: e.target.value })} required>
              <option value="">—</option>{rooms.map((r: any) => <option key={r.id} value={r.id}>{r.number} — {r.status}</option>)}
            </select></div>
          <div><label className="label">Arrivée</label><input className="input" type="date" value={f.checkIn} onChange={e => setF({ ...f, checkIn: e.target.value })} required /></div>
          <div><label className="label">Départ</label><input className="input" type="date" value={f.checkOut} onChange={e => setF({ ...f, checkOut: e.target.value })} required /></div>
          <div><label className="label">Adultes</label><input className="input" type="number" min={1} value={f.adults} onChange={e => setF({ ...f, adults: e.target.value })} /></div>
          <div><label className="label">Enfants</label><input className="input" type="number" min={0} value={f.children} onChange={e => setF({ ...f, children: e.target.value })} /></div>
          <div><label className="label">Tarif / nuit (centimes)</label><input className="input" type="number" min={0} value={f.nightlyRateCents} onChange={e => setF({ ...f, nightlyRateCents: e.target.value })} /></div>
          <div><label className="label">Remise (centimes)</label><input className="input" type="number" min={0} value={f.discountCents} onChange={e => setF({ ...f, discountCents: e.target.value })} /></div>
          <div className="md:col-span-4"><button className="btn-primary">Créer</button></div>
        </form>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </div>
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Réservations</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-900/60">
            <tr><th className="py-2">Réf.</th><th>Client</th><th>Chambre</th><th>Arrivée</th><th>Départ</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-navy-900/5">
            {list.map(r => (
              <tr key={r.id}><td className="py-2">{r.reference}</td>
                <td>{r.first_name} {r.last_name}</td><td>{r.room_number}</td>
                <td>{r.check_in}</td><td>{r.check_out}</td><td>{r.status}</td>
                <td><Link to={'/reservations/' + r.id} className="text-gold-500 hover:underline">Détails</Link></td></tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-sm text-navy-900/50 py-4">Aucune réservation.</div>}
      </div>
    </div>
  );
}