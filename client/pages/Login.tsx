import { useState } from 'react';
import { api } from '../api';
export default function Login({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900">
      <div className="card p-8 w-full max-w-md">
        <h1 className="font-display text-2xl mb-1">Hotelyx</h1>
        <p className="text-sm text-navy-900/60 mb-6">Connexion à votre espace de gestion.</p>
        <form className="space-y-3" onSubmit={async e => {
          e.preventDefault(); setErr(''); setBusy(true);
          try { await api('/auth/login', { body: f }); onDone(); }
          catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
          <div><label className="label">Email</label>
            <input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></div>
          <div><label className="label">Mot de passe</label>
            <input className="input" type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </div>
    </div>
  );
}