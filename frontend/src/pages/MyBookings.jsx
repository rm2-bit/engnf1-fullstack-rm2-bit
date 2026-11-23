import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, ErrorBox, Modal, Notice, Pagination, Spinner } from '../components/ui.jsx';
import { useApi } from '../hooks.js';
import { fmtDateTime } from '../lib/time.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default function MyBookings() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState(null);

  const { data, loading, error, reload } = useApi(() => api('/bookings/mine', { query: { status, page } }), [status, page]);

  async function confirmCancel() {
    setCancelling(true);
    try {
      await api(`/bookings/${toCancel.id}/cancel`, { method: 'PATCH' });
      setMsg({ type: 'ok', text: 'Booking cancelled.' });
      reload();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setCancelling(false);
      setToCancel(null);
    }
  }

  const cancellable = (b) => ['PENDING', 'APPROVED'].includes(b.status) && new Date(b.startTime) > new Date();

  return (
    <>
      <div className="page-head">
        <h1>My bookings</h1>
        <label>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <Notice type={msg?.type} onClose={() => setMsg(null)}>{msg?.text}</Notice>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && <Empty>You have no bookings{status ? ` with status ${status}` : ''}.</Empty>}
      {data && data.data.length > 0 && (
        <div className="card table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead>
              <tr><th>Resource</th><th>Start</th><th>End</th><th>Purpose</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.data.map((b) => (
                <tr key={b.id}>
                  <td className="wrap">{b.resourceName}</td>
                  <td>{fmtDateTime(b.startTime)}</td>
                  <td>{fmtDateTime(b.endTime)}</td>
                  <td className="wrap">
                    {b.purpose}
                    {b.decisionNote && <div className="muted">Admin note: {b.decisionNote}</div>}
                  </td>
                  <td><Badge value={b.status} /></td>
                  <td>{cancellable(b) && <button className="btn btn-small" onClick={() => setToCancel(b)}>Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}

      {toCancel && (
        <Modal title="Cancel this booking?" onClose={() => !cancelling && setToCancel(null)}>
          <p>
            {toCancel.resourceName}, {fmtDateTime(toCancel.startTime)} – {fmtDateTime(toCancel.endTime)}. The slot becomes available to others.
          </p>
          <div className="row">
            <button className="btn btn-danger" onClick={confirmCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Yes, cancel booking'}
            </button>
            <button className="btn" onClick={() => setToCancel(null)} disabled={cancelling}>Keep it</button>
          </div>
        </Modal>
      )}
    </>
  );
}
