import { useEffect, useState } from 'react';
import { api } from '../api';
const STATUS: Record<string, { label: string; cls: string }> = {
  available: { label: 'Disponible', cls: 'bg-emerald-100 text-emerald-800' }, occupied: { label: 'Occupée', cls: 'bg-red-100 text-red-800' },
  dirty: { label: 'À nettoyer', cls: 'bg-amber-100 text-amber-800' }, cleaning: { label: 'Nettoyage', cls: 'bg-blue-100 text-blue-800' },
  inspected: { label: 'Inspectée', cls: 'bg-teal-100 text-teal-800' }, out_of_service: { label: 'Hors service', cls: 'bg-gray-200 text-gray-800' }
};
export default function Rooms() {
  const [rooms, setRooms] = useState<any[]>([]); const [types, setTypes] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ number: '', floor: 0, roomTypeId: null, status: 'available' }); const [err, setErr] = useState('');
  async function load() { setRooms(await api('/rooms')); setTypes(await api('/room-types')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Nouvelle chambre</h2>
        <form className="grid grid-cols-1 md:grid-cols-5 gap-3" onSubmit={async e => {
          e.preventDefault(); setErr('');
          try { await api('/rooms', { body: { number: form.number, floor: Number(form.floor), roomTypeId: form.roomTypeId ? Number(form.roomTypeId) : null, status: form.status } }); setForm({ number: '', floor: 0, roomTypeId: null, status: 'available' }); await load(); }
          catch (e: any) { setErr(e.message); }
        }}>
          <div><label className="label">Numéro</label><input className="input" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} required /></div>
          <div><label className="label">Étage</label><input className="input" type="number" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} /></div>
          <div><label className="label">Type</label><select className="input" value={form.roomTypeId ?? ''} onChange={e => setForm({ ...form, roomTypeId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className="label">Statut</label><select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div className="flex items-end"><button className="btn-primary w-full justify-center">Ajouter</button></div>
        </form>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {rooms.map(r => (
          <div key={r.id} className="card p-4">
            <div className="flex justify-between items-start">
              <div className="font-display text-xl">{r.number}</div>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
            </div>
            <div className="text-xs text-navy-900/50 mt-1">{r.room_type_name ?? '—'} · Étage {r.floor}</div>
            <select className="input mt-3 text-xs" value={r.status} onChange={async e => { try { await api('/rooms/' + r.id, { method: 'PATCH', body: { status: e.target.value } }); await load(); } catch (e: any) { setErr(e.message); } }}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}