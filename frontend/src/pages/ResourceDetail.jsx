import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, ErrorBox, Notice, Spinner } from '../components/ui.jsx';
import { useApi } from '../hooks.js';
import { fmtTime, localDateValue, localDayRange, slotsForDate } from '../lib/time.js';

const MIN = 30 * 60_000;
const MAX = 240 * 60_000;

export default function ResourceDetail() {
  const { id } = useParams();
  const [date, setDate] = useState(localDateValue());
  const [startIso, setStartIso] = useState('');
  const [endIso, setEndIso] = useState('');
  const [purpose, setPurpose] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const resource = useApi(() => api(`/resources/${id}`), [id]);
  const { start, end } = useMemo(() => localDayRange(date), [date]);
  const availability = useApi(
    () => api(`/resources/${id}/availability`, { query: { from: start.toISOString(), to: end.toISOString() } }),
    [id, date],
  );
  const tickets = useApi(() => api('/tickets', { query: { status: 'OPEN', limit: 50 } }), []);

  const slots = useMemo(() => slotsForDate(date), [date]);
  const now = Date.now();

  // Reset the time pickers when the day changes.
  useEffect(() => {
    setStartIso('');
    setEndIso('');
  }, [date]);

  const startOptions = slots.slice(0, -1).filter((s) => s.ms > now);
  const endOptions = startIso
    ? slots.filter((s) => s.ms - new Date(startIso).getTime() >= MIN && s.ms - new Date(startIso).getTime() <= MAX)
    : [];

  const busyAt = (ms) =>
    (availability.data?.bookings || []).some((b) => new Date(b.startTime).getTime() < ms + MIN && new Date(b.endTime).getTime() > ms);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/bookings', {
        method: 'POST',
        body: { resourceId: id, startTime: startIso, endTime: endIso, purpose, ...(ticketId ? { ticketId } : {}) },
      });
      setMsg({ type: 'ok', text: 'Booking requested. It is PENDING until an admin approves it.' });
      setPurpose('');
      setStartIso('');
      setEndIso('');
      availability.reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      if (err.status === 409) availability.reload();
    } finally {
      setBusy(false);
    }
  }

  if (resource.loading && !resource.data) return <Spinner />;
  if (resource.error) return <ErrorBox message={resource.error} onRetry={resource.reload} />;
  const r = resource.data;

  return (
    <>
      <p><Link to="/resources">← All resources</Link></p>
      <div className="card stack" style={{ marginBottom: '1rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>{r.name}</h1>
          <Badge value={r.type} />
        </div>
        <div className="muted">Capacity {r.capacity}{!r.isActive && ' · inactive (cannot be booked)'}</div>
        <div>{r.description || <span className="muted">No description</span>}</div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <section className="card stack">
          <h2>Availability</h2>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          {availability.error && <ErrorBox message={availability.error} onRetry={availability.reload} />}
          {availability.loading && !availability.data && <Spinner />}
          {availability.data && (
            <>
              <div className="slots" aria-label="Slots for the day">
                {slots.slice(0, -1).map((s) => (
                  <div key={s.ms} className={`slot ${busyAt(s.ms) ? 'busy' : s.ms <= now ? 'past' : ''}`} title={busyAt(s.ms) ? 'Booked' : s.ms <= now ? 'Past' : 'Free'}>
                    {s.label}
                  </div>
                ))}
              </div>
              <p className="muted">Green = free · Red = booked · Grey = in the past. Times are in your local time zone.</p>
              {availability.data.bookings.length === 0 ? (
                <p className="muted">Nothing booked on this day.</p>
              ) : (
                <ul>
                  {availability.data.bookings.map((b) => (
                    <li key={b.startTime}>
                      {fmtTime(b.startTime)} – {fmtTime(b.endTime)} <Badge value={b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="card stack">
          <h2>Book this resource</h2>
          {!r.isActive ? (
            <Notice type="info">This resource is inactive and cannot be booked.</Notice>
          ) : (
            <form className="form" style={{ maxWidth: 'none' }} onSubmit={submit}>
              <Notice type={msg?.type} onClose={() => setMsg(null)}>{msg?.text}</Notice>
              <div className="row">
                <label style={{ flex: 1 }}>
                  Start
                  <select value={startIso} onChange={(e) => { setStartIso(e.target.value); setEndIso(''); }} required>
                    <option value="">Select…</option>
                    {startOptions.map((s) => <option key={s.iso} value={s.iso}>{s.label}</option>)}
                  </select>
                </label>
                <label style={{ flex: 1 }}>
                  End
                  <select value={endIso} onChange={(e) => setEndIso(e.target.value)} required disabled={!startIso}>
                    <option value="">Select…</option>
                    {endOptions.map((s) => <option key={s.iso} value={s.iso}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              <label>
                Purpose (5-200 characters)
                <textarea rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} minLength={5} maxLength={200} required />
              </label>
              <label>
                Link a ticket (optional)
                <select value={ticketId} onChange={(e) => setTicketId(e.target.value)}>
                  <option value="">None</option>
                  {(tickets.data?.data || []).map((t) => (
                    <option key={t.id} value={t.id}>{t.subject.slice(0, 60)}</option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" disabled={busy || !startIso || !endIso}>
                {busy ? 'Requesting…' : 'Request booking'}
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
