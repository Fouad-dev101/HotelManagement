import { useEffect, useState } from 'react';
import { api } from '../api';
const ROLES: Array<[string, string]> = [['admin', 'Administrateur'], ['manager', 'Directeur'], ['reception', 'Réceptionniste'], ['housekeeping', 'Personnel de nettoyage'], ['accountant', 'Comptable'], ['maintenance', 'Maintenance']];
export default function Users() {
  const [list, setList] = useState<any[]>([]); const [f, setF] = useState({ email: '', fullName: '', password: '', role: 'reception' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  async function load() { try { setList(await api('/users')); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Nouvel employé</h2>
        <form className="grid grid-cols-1 md:grid-cols-5 gap-3" onSubmit={async e => {
          e.preventDefault(); setErr(''); setOk('');
          try { await api('/users', { body: f }); setF({ email: '', fullName: '', password: '', role: 'reception' }); setOk('Compte créé.'); await load(); } catch (e: any) { setErr(e.message); }
        }}>
          <div><label className="label">Nom complet</label><input className="input" value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} required /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></div>
          <div><label className="label">Mot de passe</label><input className="input" type="password" minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
          <div><label className="label">Rôle</label><select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="flex items-end"><button className="btn-primary w-full justify-center">Créer</button></div>
        </form>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}{ok && <div className="text-sm text-emerald-700 mt-2">{ok}</div>}
      </div>
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Employés</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-900/60"><tr><th className="py-2">Nom</th><th>Email</th><th>Rôle</th><th>Actif</th><th></th></tr></thead>
          <tbody className="divide-y divide-navy-900/5">
            {list.map(u => (
              <tr key={u.id}>
                <td className="py-2">{u.full_name}</td><td>{u.email}</td>
                <td><select className="input text-xs" value={u.role} onChange={async e => { try { await api('/users/' + u.id, { method: 'PATCH', body: { role: e.target.value } }); await load(); } catch (e: any) { setErr(e.message); } }}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td>{u.active ? 'Oui' : 'Non'}</td>
                <td><button className="btn-ghost text-xs" onClick={async () => { try { await api('/users/' + u.id, { method: 'PATCH', body: { active: !u.active } }); await load(); } catch (e: any) { setErr(e.message); } }}>{u.active ? 'Désactiver' : 'Réactiver'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}