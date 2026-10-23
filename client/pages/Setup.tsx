import { useState } from 'react';
import { api } from '../api';
export default function Setup({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', password: '', hotelName: 'Hôtel YX' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900">
      <div className="card p-8 w-full max-w-md">
        <h1 className="font-display text-2xl mb-1">Bienvenue sur Hotelyx</h1>
        <p className="text-sm text-navy-900/60 mb-6">Créez le compte administrateur de votre établissement.</p>
        <form className="space-y-3" onSubmit={async e => {
          e.preventDefault(); setErr(''); setBusy(true);
          try { await api('/setup', { body: f }); onDone(); }
          catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
          <div><label className="label">Nom de l'hôtel</label>
            <input className="input" value={f.hotelName} onChange={e => setF({ ...f, hotelName: e.target.value })} required /></div>
          <div><label className="label">Nom complet</label>
            <input className="input" value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} required /></div>
          <div><label className="label">Email</label>
            <input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></div>
          <div><label className="label">Mot de passe (min. 8 caractères)</label>
            <input className="input" type="password" minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button className="btn-gold w-full justify-center" disabled={busy}>{busy ? 'Création…' : 'Créer le compte'}</button>
        </form>
      </div>
    </div>
  );
}