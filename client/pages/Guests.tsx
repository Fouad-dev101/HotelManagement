import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Guests() {
  const [q, setQ] = useState(''); const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', country: 'Maroc' });
  const [err, setErr] = useState('');
  async function load() { setList(await api('/guests?q=' + encodeURIComponent(q))); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, [q]);
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Nouveau client</h2>
        <form className="grid grid-cols-1 md:grid-cols-6 gap-3" onSubmit={async e => {
          e.preventDefault(); setErr('');
          try { await api('/guests', { body: form }); setForm({ firstName: '', lastName: '', phone: '', email: '', country: 'Maroc' }); await load(); }
          catch (e: any) { setErr(e.message); }
        }}>
          <div><label className="label">Prénom</label><input className="input" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required /></div>
          <div><label className="label">Nom</label><input className="input" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required /></div>
          <div><label className="label">Téléphone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Pays</label><input className="input" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
          <div className="flex items-end"><button className="btn-primary w-full justify-center">Ajouter</button></div>
        </form>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </div>
      <div className="card p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-display text-lg">Clients</h2>
          <input className="input max-w-xs" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-900/60">
            <tr><th className="py-2">Nom</th><th>Téléphone</th><th>Email</th><th>Pays</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-900/5">
            {list.map(g => <tr key={g.id}><td className="py-2">{g.first_name} {g.last_name}</td><td>{g.phone}</td><td>{g.email}</td><td>{g.country}</td></tr>)}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-sm text-navy-900/50 py-4">Aucun client.</div>}
      </div>
    </div>
  );
}