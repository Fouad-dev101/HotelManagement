import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Maintenance() {
  const [list, setList] = useState<any[]>([]); const [rooms, setRooms] = useState<any[]>([]);
  const [f, setF] = useState({ roomId: '', category: 'Climatisation', description: '', priority: 'normal', markOutOfService: false });
  const [err, setErr] = useState('');
  async function load() { setList(await api('/maintenance')); setRooms(await api('/rooms')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Signaler un incident</h2>
        <form className="grid grid-cols-1 md:grid-cols-6 gap-3" onSubmit={async e => {
          e.preventDefault(); setErr('');
          try { await api('/maintenance', { body: { ...f, roomId: Number(f.roomId) } }); await load(); }
          catch (e: any) { setErr(e.message); }
        }}>
          <div><label className="label">Chambre</label>
            <select className="input" value={f.roomId} onChange={e => setF({ ...f, roomId: e.target.value })} required>
              <option value="">—</option>{rooms.map((r: any) => <option key={r.id} value={r.id}>{r.number}</option>)}
            </select></div>
          <div><label className="label">Catégorie</label>
            <select className="input" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
              {['Climatisation','Plomberie','Électricité','Équipement','Autre'].map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div className="md:col-span-2"><label className="label">Description</label>
            <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} required /></div>
          <div><label className="label">Priorité</label>
            <select className="input" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
              <option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option>
            </select></div>
          <div className="flex items-end"><button className="btn-primary w-full justify-center">Créer</button></div>
          <div className="md:col-span-6 flex items-center gap-2">
            <input type="checkbox" checked={f.markOutOfService} onChange={e => setF({ ...f, markOutOfService: e.target.checked })} />
            <label className="text-sm">Marquer la chambre hors service</label>
          </div>
        </form>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </div>
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Tickets</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-900/60">
            <tr><th className="py-2">Chambre</th><th>Catégorie</th><th>Description</th><th>Priorité</th><th>Statut</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-900/5">
            {list.map(t => <tr key={t.id}><td className="py-2">{t.room_number}</td><td>{t.category}</td><td>{t.description}</td><td>{t.priority}</td><td>{t.status}</td></tr>)}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-sm text-navy-900/50 py-4">Aucun ticket.</div>}
      </div>
    </div>
  );
}