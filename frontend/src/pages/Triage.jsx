import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, ErrorBox, Notice, Pagination, Spinner } from '../components/ui.jsx';
import { useApi, useDebounced } from '../hooks.js';
import { fmtDateTime } from '../lib/time.js';

const CATEGORIES = ['BILLING', 'BUG', 'FEATURE_REQUEST', 'LOGIN', 'DELIVERY'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const pretty = (s) => s.replace(/_/g, ' ');

function StatsStrip({ refreshKey }) {
  const { data, loading, error, reload } = useApi(() => api('/stats'), [refreshKey]);
  if (error) return <ErrorBox message={`Stats unavailable: ${error}`} onRetry={reload} />;
  if (!data) return loading ? <Spinner label="Loading stats…" /> : null;
  const total = Object.values(data.byStatus).reduce((a, b) => a + b, 0);
  const tiles = [
    ['Total tickets', total],
    ['Open', data.byStatus.OPEN],
    ['Urgent', data.byPriority.URGENT],
    ['Reviewed', data.reviewedCount],
    ['Model agreement', `${data.modelAgreementRate}%`],
  ];
  return (
    <>
      <div className="stats">
        {tiles.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="num">{value}</div>
            <div className="lbl">{label}</div>
          </div>
        ))}
      </div>
      <div className="row muted" style={{ marginBottom: '.75rem' }}>
        {CATEGORIES.map((c) => (
          <span key={c}>
            {pretty(c)}: <strong>{data.byCategory[c]}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

function TicketPanel({ detail, loading, error, onClose, onPatch, me, onRetry }) {
  return (
    <aside className="card panel" aria-label="Ticket detail">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Ticket detail</h2>
        <button className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      {loading && !detail && <Spinner />}
      {error && <ErrorBox message={error} onRetry={onRetry} />}
      {detail && (
        <div className="stack">
          {/* React escapes text nodes, so payloads like <script> render as plain text (T-B5). */}
          <h3>{detail.ticket.subject}</h3>
          <div className="pre">{detail.ticket.body}</div>
          <div className="row">
            <Badge value={detail.ticket.status} />
            <Badge value={detail.ticket.priority} />
            <Badge value={detail.ticket.category} />
            {detail.ticket.isReviewed && <Badge value="reviewed" />}
            {detail.ticket.isHumanOverride && <span className="badge">human override</span>}
          </div>
          <div className="muted">
            Auto category: {pretty(detail.ticket.autoCategory)} · External id: {detail.ticket.externalId}
          </div>

          <div className="form-wide">
            <label>
              Category
              <select value={detail.ticket.category} onChange={(e) => onPatch(detail.ticket, { category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{pretty(c)}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={detail.ticket.priority} onChange={(e) => onPatch(detail.ticket, { priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={detail.ticket.status} onChange={(e) => onPatch(detail.ticket, { status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{pretty(s)}</option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select
                value={detail.ticket.assigneeId === me.id ? 'me' : detail.ticket.assigneeId ? 'other' : ''}
                onChange={(e) => onPatch(detail.ticket, { assigneeId: e.target.value === 'me' ? me.id : null })}
              >
                <option value="">Unassigned</option>
                <option value="me">Me ({me.name})</option>
                {detail.ticket.assigneeId && detail.ticket.assigneeId !== me.id && (
                  <option value="other" disabled>Another agent</option>
                )}
              </select>
            </label>
          </div>

          <h3>Audit history</h3>
          {detail.events.length === 0 ? (
            <p className="muted">No changes yet.</p>
          ) : (
            <ul className="events">
              {detail.events.map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.field}</strong>: {ev.oldValue ?? '—'} → {ev.newValue ?? '—'}
                  <div className="muted">
                    {ev.actor} · {fmtDateTime(ev.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}

export default function Triage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ status: '', category: '', priority: '' });
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput, 300);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [statsKey, setStatsKey] = useState(0);
  const [notice, setNotice] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailKey, setDetailKey] = useState(0);
  const listReq = useRef(0);

  // List: refetches live (no page reload) whenever a filter, the search text or the page changes.
  useEffect(() => {
    const id = ++listReq.current;
    setLoading(true);
    setError('');
    api('/tickets', { query: { ...filters, q, page, limit: 10 } })
      .then((r) => {
        if (id !== listReq.current) return;
        setItems(r.data);
        setMeta({ total: r.total, totalPages: r.totalPages });
        setLoading(false);
      })
      .catch((e) => {
        if (id !== listReq.current) return;
        setError(e.message);
        setLoading(false);
      });
  }, [filters, q, page, refreshKey]);

  // Detail panel
  useEffect(() => {
    if (!selectedId) return undefined;
    let alive = true;
    setDetailLoading(true);
    setDetailError('');
    api(`/tickets/${selectedId}`)
      .then((r) => alive && setDetail(r))
      .catch((e) => alive && setDetailError(e.message))
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedId, detailKey]);

  const setFilter = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };

  function select(id) {
    if (id !== selectedId) setDetail(null);
    setSelectedId(id);
  }

  /**
   * Optimistic update with rollback. The UI changes immediately; if the server rejects (or the
   * network fails) only the fields we touched are restored and a visible message is shown.
   */
  async function patchTicket(ticket, patch) {
    const reviewedNow =
      (patch.category && patch.category !== ticket.category) || (patch.status && ticket.status === 'OPEN' && patch.status !== 'OPEN');
    const optimistic = {
      ...ticket,
      ...patch,
      ...(patch.category && patch.category !== ticket.category ? { isHumanOverride: true } : {}),
      ...(reviewedNow ? { isReviewed: true } : {}),
    };
    const restore = {
      ...Object.fromEntries(Object.keys(patch).map((k) => [k, ticket[k]])),
      isHumanOverride: ticket.isHumanOverride,
      isReviewed: ticket.isReviewed,
    };
    const apply = (t) => (t.id === ticket.id ? { ...t, ...optimistic } : t);
    const revert = (t) => (t.id === ticket.id ? { ...t, ...restore } : t);

    setNotice(null);
    setItems((list) => list.map(apply));
    setDetail((d) => (d && d.ticket.id === ticket.id ? { ...d, ticket: apply(d.ticket) } : d));

    try {
      const r = await api(`/tickets/${ticket.id}`, { method: 'PATCH', body: patch, headers: { 'X-Agent': user.email } });
      setItems((list) => list.map((t) => (t.id === ticket.id ? r.ticket : t)));
      setDetail((d) => (d && d.ticket.id === ticket.id ? r : d));
      setStatsKey((k) => k + 1);
    } catch (e) {
      setItems((list) => list.map(revert));
      setDetail((d) => (d && d.ticket.id === ticket.id ? { ...d, ticket: revert(d.ticket) } : d));
      setNotice({ type: 'error', text: `Update failed and was rolled back: ${e.message}` });
    }
  }

  async function runImport(payload) {
    setImporting(true);
    setNotice(null);
    try {
      const r = await api('/tickets/import', { method: 'POST', body: payload });
      setNotice({
        type: 'ok',
        text: `Import finished: ${r.importedCount} new, ${r.updatedCount} updated, ${r.skippedOverrideCount} protected by human override (${r.total} in feed).`,
      });
      setPage(1);
      setRefreshKey((k) => k + 1);
      setStatsKey((k) => k + 1);
      setDetailKey((k) => k + 1);
    } catch (e) {
      setNotice({ type: 'error', text: `Import failed: ${e.message}` });
    } finally {
      setImporting(false);
    }
  }

  async function reimportSample() {
    try {
      const res = await fetch('/sample-feed.json');
      if (!res.ok) throw new Error('Sample feed not found');
      await runImport(await res.json());
    } catch (e) {
      setNotice({ type: 'error', text: `Import failed: ${e.message}` });
    }
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await runImport(Array.isArray(parsed) ? { tickets: parsed } : parsed);
    } catch {
      setNotice({ type: 'error', text: 'That file is not valid JSON.' });
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Triage queue</h1>
        <div className="row">
          <button className="btn btn-primary" onClick={reimportSample} disabled={importing}>
            {importing ? 'Importing…' : 'Re-Import Feed'}
          </button>
          <label style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="btn btn-small" style={{ cursor: 'pointer' }}>Import JSON file…</span>
            <input type="file" accept="application/json,.json" onChange={importFile} hidden />
          </label>
        </div>
      </div>

      <StatsStrip refreshKey={statsKey} />
      <Notice type={notice?.type} onClose={() => setNotice(null)}>{notice?.text}</Notice>

      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="form-wide" role="search">
          <label>
            Search
            <input
              type="search"
              placeholder="Search subject or body"
              value={qInput}
              maxLength={200}
              onChange={(e) => {
                setQInput(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Status
            <select value={filters.status} onChange={setFilter('status')}>
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
            </select>
          </label>
          <label>
            Category
            <select value={filters.category} onChange={setFilter('category')}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={filters.priority} onChange={setFilter('priority')}>
              <option value="">All</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="split">
        <section className="card" aria-label="Tickets">
          {error && <ErrorBox message={error} onRetry={() => setRefreshKey((k) => k + 1)} />}
          {loading && items.length === 0 && <Spinner label="Loading tickets…" />}
          {!loading && !error && items.length === 0 && <Empty>No tickets match these filters.</Empty>}
          {items.length > 0 && (
            <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className={`clickable ${t.id === selectedId ? 'selected' : ''}`} onClick={() => select(t.id)}>
                      <td className="wrap">
                        <button className="btn btn-small" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => select(t.id)}>
                          {t.subject}
                        </button>
                      </td>
                      <td><Badge value={t.category} /></td>
                      <td><Badge value={t.priority} /></td>
                      <td><Badge value={t.status} /></td>
                      <td>{t.isReviewed ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={meta.totalPages} onChange={setPage} />
          {meta.total > 0 && <p className="muted">{meta.total} tickets</p>}
        </section>

        {selectedId && (
          <TicketPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            me={user}
            onPatch={patchTicket}
            onRetry={() => setDetailKey((k) => k + 1)}
            onClose={() => {
              setSelectedId(null);
              setDetail(null);
            }}
          />
        )}
      </div>
    </>
  );
}
