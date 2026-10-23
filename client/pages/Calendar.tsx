import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
const COLORS: Record<string, string> = { pending: 'bg-amber-200 text-amber-900', confirmed: 'bg-emerald-200 text-emerald-900', in_progress: 'bg-blue-200 text-blue-900', completed: 'bg-gray-200 text-gray-700', cancelled: 'bg-red-100 text-red-700 line-through', no_show: 'bg-purple-200 text-purple-900' };
function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export default function Calendar() {
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10)); const [days, setDays] = useState(14);
  const [data, setData] = useState<any>(null); const [err, setErr] = useState('');
  const end = useMemo(() => addDays(start, days - 1), [start, days]);
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days]);
  async function load() { try { setData(await api(`/calendar?from=${start}&to=${end}`)); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, [start, end]);
  function findRes(roomId: number, day: string) { return data?.reservations.find((r: any) => r.room_id === roomId && r.check_in <= day && r.check_out > day); }
  return (
    <div className="space-y-6">
      <div className="card p-5 flex flex-wrap items-center gap-3">
        <div><label className="label">Début</label><input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className="label">Durée (jours)</label><select className="input" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 14, 21, 30].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className="ml-auto text-sm text-navy-900/60">Du {start} au {end}</div>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      {data && (
        <div className="card p-5 overflow-auto">
          <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${days}, minmax(40px, 1fr))`, gap: '2px' }}>
            <div className="text-xs text-navy-900/50 p-2">Chambre</div>
            {dayList.map(d => <div key={d} className="text-xs text-center text-navy-900/60 p-2 border-b border-navy-900/10">{d.slice(5)}</div>)}
            {data.rooms.map((room: any) => (
              <div key={room.id} className="contents">
                <div className="text-sm font-medium p-2 border-r border-navy-900/10">{room.number}</div>
                {dayList.map(d => { const r = findRes(room.id, d); const isFirst = r && r.check_in === d; return <div key={d + room.id} className={`text-[10px] p-1 rounded ${r ? COLORS[r.status] : 'bg-navy-900/5'}`}>{isFirst ? r.guest_name : ''}</div>; })}
              </div>
            ))}
          </div>
          {data.rooms.length === 0 && <div className="text-sm text-navy-900/50">Aucune chambre active.</div>}
        </div>
      )}
    </div>
  );
}