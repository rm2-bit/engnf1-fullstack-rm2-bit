import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, ErrorBox, Modal, Notice, Pagination, Spinner } from '../components/ui.jsx';
import { useApi } from '../hooks.js';
import { endOfDayIso, fmtDateTime, startOfDayIso } from '../lib/time.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default function AdminBookings() {
  const [filters, setFilters] = useState({ status: '', resourceId: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [resources, setResources] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState('');
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Load every resource (10 per page) for the filter dropdown.
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = [];
      for (let p = 1; ; p++) {
        const r = await api('/resources', { query: { page: p } });
        all.push(...r.data);
        if (p >= r.totalPages) break;
      }
      if (alive) setResources(all);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const { data, loading, error, reload } = useApi(
    () =>
      api('/bookings', {
        query: {
          status: filters.status,
          resourceId: filters.resourceId,
          from: filters.from ? startOfDayIso(filters.from) : '',
          to: filters.to ? endOfDayIso(filters.to) : '',
          page,
        },
      }),
    [filters, page],
  );

  const setFilter = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };

  async function approve(b) {
    try {
      await api(`/bookings/${b.id}/approve`, { method: 'PATCH' });
      setMsg({ type: 'ok', text: 'Booking approved.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
    reload();
  }

  async function reject() {
    setBusy(true);
    setModalError('');
    try {
      await api(`/bookings/${rejecting.id}/reject`, { method: 'PATCH', body: { note } });
      setRejecting(null);
      setNote('');
      setMsg({ type: 'ok', text: 'Booking rejected.' });
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><h1>All bookings</h1></div>
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="form-wide">
          <label>Status
            <select value={filters.status} onChange={setFilter('status')}>
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Resource
            <select value={filters.resourceId} onChange={setFilter('resourceId')}>
              <option value="">All</option>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>From<input type="date" value={filters.from} onChange={setFilter('from')} /></label>
          <label>To<input type="date" value={filters.to} onChange={setFilter('to')} /></label>
        </div>
      </div>

      <Notice type={msg?.type} onClose={() => setMsg(null)}>{msg?.text}</Notice>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && <Empty>No bookings match these filters.</Empty>}
      {data && data.data.length > 0 && (
        <div className="card table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead><tr><th>Resource</th><th>Requested by</th><th>Start</th><th>End</th><th>Purpose</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.data.map((b) => {
                const actionable = b.status === 'PENDING' && new Date(b.startTime) > new Date();
                return (
                  <tr key={b.id}>
                    <td className="wrap">{b.resourceName}</td>
                    <td className="wrap">{b.userName}<div className="muted">{b.userEmail}</div></td>
                    <td>{fmtDateTime(b.startTime)}</td>
                    <td>{fmtDateTime(b.endTime)}</td>
                    <td className="wrap">{b.purpose}{b.decisionNote && <div className="muted">Note: {b.decisionNote}</div>}</td>
                    <td><Badge value={b.status} /></td>
                    <td>
                      {actionable && (
                        <div className="row">
                          <button className="btn btn-small btn-primary" onClick={() => approve(b)}>Approve</button>
                          <button className="btn btn-small" onClick={() => { setRejecting(b); setNote(''); setModalError(''); }}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}

      {rejecting && (
        <Modal title="Reject booking" onClose={() => !busy && setRejecting(null)}>
          <p className="muted">{rejecting.resourceName}, {fmtDateTime(rejecting.startTime)}</p>
          <Notice type="error">{modalError}</Notice>
          <label>Reason for rejection (5-200 characters, required)
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
          <div className="row">
            <button className="btn btn-danger" onClick={reject} disabled={busy}>{busy ? 'Rejecting…' : 'Reject booking'}</button>
            <button className="btn" onClick={() => setRejecting(null)} disabled={busy}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  );
}
