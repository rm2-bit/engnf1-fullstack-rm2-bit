import { api } from '../api.js';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';
import { useApi } from '../hooks.js';

function Bars({ title, counts }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <section className="card stack">
      <h2>{title}</h2>
      {Object.entries(counts).map(([k, v]) => (
        <div key={k}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{k.replace(/_/g, ' ')}</span>
            <strong>{v}</strong>
          </div>
          <div className="bar" role="img" aria-label={`${k}: ${v}`}>
            <span style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

export default function AdminAnalytics() {
  const { data, loading, error, reload } = useApi(() => api('/admin/stats'), []);
  if (loading && !data) return <Spinner label="Loading analytics…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Empty>No data yet.</Empty>;

  const { activeResources, bookingsByStatus, topResources, ticketStats } = data;
  const totalTickets = Object.values(ticketStats.byStatus).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="page-head">
        <h1>Analytics</h1>
        <button className="btn btn-small" onClick={reload}>Refresh</button>
      </div>
      <div className="stats">
        <div className="stat"><div className="num">{activeResources}</div><div className="lbl">Active resources</div></div>
        <div className="stat"><div className="num">{totalTickets}</div><div className="lbl">Tickets</div></div>
        <div className="stat"><div className="num">{ticketStats.reviewedCount}</div><div className="lbl">Reviewed tickets</div></div>
        <div className="stat"><div className="num">{ticketStats.modelAgreementRate}%</div><div className="lbl">Model agreement</div></div>
      </div>
      <div className="grid">
        <Bars title="Bookings by status" counts={bookingsByStatus} />
        <Bars title="Tickets by status" counts={ticketStats.byStatus} />
        <Bars title="Tickets by priority" counts={ticketStats.byPriority} />
        <Bars title="Tickets by category" counts={ticketStats.byCategory} />
        <section className="card stack">
          <h2>Top resources</h2>
          {topResources.length === 0 ? (
            <p className="muted">No bookings yet.</p>
          ) : (
            <ol>
              {topResources.map((r) => (
                <li key={r.resourceId}>{r.name} <span className="muted">({r.type}) · {r.bookingCount} bookings</span></li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
