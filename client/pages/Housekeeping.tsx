import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Housekeeping() {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState('');
  async function load() { setList(await api('/housekeeping')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);
  return (
    <div className="card p-5">
      <h2 className="font-display text-lg mb-3">Tâches de nettoyage</h2>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-navy-900/60">
          <tr><th className="py-2">Chambre</th><th>Statut</th><th>Priorité</th><th>Créée</th><th></th></tr>
        </thead>
        <tbody className="divide-y divide-navy-900/5">
          {list.map(t => (
            <tr key={t.id}><td className="py-2">{t.room_number}</td><td>{t.status}</td><td>{t.priority}</td>
              <td>{new Date(t.created_at).toLocaleString('fr-FR')}</td>
              <td className="space-x-2">
                {t.status === 'pending' && <button className="btn-ghost text-xs" onClick={async () => { await api('/housekeeping/' + t.id, { method: 'PATCH', body: { status: 'in_progress' } }); await load(); }}>Commencer</button>}
                {t.status === 'in_progress' && <button className="btn-ghost text-xs" onClick={async () => { await api('/housekeeping/' + t.id, { method: 'PATCH', body: { status: 'done' } }); await load(); }}>Terminer</button>}
                {t.status === 'done' && <button className="btn-ghost text-xs" onClick={async () => { await api('/housekeeping/' + t.id, { method: 'PATCH', body: { status: 'inspected' } }); await load(); }}>Inspecter</button>}
              </td></tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <div className="text-sm text-navy-900/50 py-4">Aucune tâche.</div>}
    </div>
  );
}