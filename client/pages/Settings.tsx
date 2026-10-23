import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Settings() {
  const [s, setS] = useState<any>(null); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [svc, setSvc] = useState({ name: '', priceCents: 0 }); const [rt, setRt] = useState({ name: '', capacity: 2, basePriceCents: 0 });
  const [services, setServices] = useState<any[]>([]); const [types, setTypes] = useState<any[]>([]);
  async function load() { setS(await api('/settings')); setServices(await api('/services')); setTypes(await api('/room-types')); }
  useEffect(() => { load().catch(e => setErr(e.message)); }, []);
  if (!s) return <div>Chargement…</div>;
  return (
    <div className="space-y-6">
      {err && <div className="text-sm text-red-600">{err}</div>}
      {ok && <div className="text-sm text-emerald-700">{ok}</div>}
      <div className="card p-5">
        <h2 className="font-display text-lg mb-3">Hôtel</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={async e => {
          e.preventDefault(); setErr(''); setOk('');
          try {
            await api('/settings', { method: 'PATCH', body: {
              hotelName: s.hotel_name, address: s.address, phone: s.phone, email: s.email, website: s.website,
              currency: s.currency, checkInTime: s.check_in_time, checkOutTime: s.check_out_time,
              taxRateBp: Number(s.tax_rate_bp), invoicePrefix: s.invoice_prefix
            }});
            setOk('Paramètres enregistrés.');
          } catch (e: any) { setErr(e.message); }
        }}>
          {[
            ['hotel_name','Nom'], ['address','Adresse'], ['phone','Téléphone'], ['email','Email'],
            ['website','Site web'], ['currency','Devise'], ['check_in_time','Heure check-in'],
            ['check_out_time','Heure check-out'], ['tax_rate_bp','TVA (points de base, ex. 1000 = 10%)'],
            ['invoice_prefix','Préfixe facture']
          ].map(([k, l]) => (
            <div key={k}><label className="label">{l}</label><input className="input" value={s[k] ?? ''} onChange={e => setS({ ...s, [k]: e.target.value })} /></div>
          ))}
          <div className="md:col-span-2"><button className="btn-primary">Enregistrer</button></div>
        </form>
        <p className="text-xs text-navy-900/50 mt-3">Les taux de TVA par défaut ne sont pas certifiés conformes. Faites vérifier la configuration fiscale par votre comptable.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-display text-lg mb-3">Services</h2>
          <form className="flex gap-2 mb-3" onSubmit={async e => {
            e.preventDefault(); await api('/services', { body: svc }); setSvc({ name: '', priceCents: 0 }); await load();
          }}>
            <input className="input" placeholder="Nom" value={svc.name} onChange={e => setSvc({ ...svc, name: e.target.value })} required />
            <input className="input w-32" type="number" min={0} placeholder="Centimes" value={svc.priceCents || ''} onChange={e => setSvc({ ...svc, priceCents: Number(e.target.value) })} required />
            <button className="btn-primary">Ajouter</button>
          </form>
          <ul className="text-sm divide-y divide-navy-900/5">
            {services.map(x => <li key={x.id} className="py-2 flex justify-between"><span>{x.name}</span><span>{(x.price_cents / 100).toFixed(2)} MAD</span></li>)}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-display text-lg mb-3">Types de chambre</h2>
          <form className="flex gap-2 mb-3" onSubmit={async e => {
            e.preventDefault(); await api('/room-types', { body: rt }); setRt({ name: '', capacity: 2, basePriceCents: 0 }); await load();
          }}>
            <input className="input" placeholder="Nom" value={rt.name} onChange={e => setRt({ ...rt, name: e.target.value })} required />
            <input className="input w-20" type="number" min={1} value={rt.capacity} onChange={e => setRt({ ...rt, capacity: Number(e.target.value) })} />
            <input className="input w-32" type="number" min={0} placeholder="Centimes" value={rt.basePriceCents || ''} onChange={e => setRt({ ...rt, basePriceCents: Number(e.target.value) })} />
            <button className="btn-primary">Ajouter</button>
          </form>
          <ul className="text-sm divide-y divide-navy-900/5">
            {types.map(x => <li key={x.id} className="py-2 flex justify-between"><span>{x.name}</span><span>{x.capacity} pers.</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}