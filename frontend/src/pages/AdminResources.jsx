import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, ErrorBox, Modal, Notice, Pagination, Spinner } from '../components/ui.jsx';
import { useApi } from '../hooks.js';

const blank = { name: '', type: 'ROOM', capacity: 10, description: '' };

function ResourceForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSubmit({ name: f.name, type: f.type, capacity: Number(f.capacity), description: f.description });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" style={{ maxWidth: 'none' }} onSubmit={submit}>
      <Notice type="error">{err}</Notice>
      <label>Name<input value={f.name} onChange={set('name')} required minLength={3} maxLength={60} /></label>
      <div className="row">
        <label style={{ flex: 1 }}>Type
          <select value={f.type} onChange={set('type')}>
            <option value="ROOM">Room</option><option value="LAB">Lab</option><option value="EQUIPMENT">Equipment</option>
          </select>
        </label>
        <label style={{ flex: 1 }}>Capacity
          <input type="number" min="1" max="500" value={f.capacity} onChange={set('capacity')} required />
        </label>
      </div>
      <label>Description (optional)<textarea rows={2} value={f.description ?? ''} onChange={set('description')} maxLength={300} /></label>
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function AdminResources() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const { data, loading, error, reload } = useApi(() => api('/resources', { query: { page } }), [page]);

  async function toggle(r) {
    try {
      await api(`/resources/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } });
      setMsg({ type: 'ok', text: `${r.name} is now ${r.isActive ? 'inactive' : 'active'}.` });
      reload();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function create(body) {
    await api('/resources', { method: 'POST', body: { ...body, description: body.description || undefined } });
    setMsg({ type: 'ok', text: 'Resource created.' });
    setPage(1);
    reload();
  }

  async function save(body) {
    await api(`/resources/${editing.id}`, { method: 'PATCH', body: { ...body, description: body.description || null } });
    setEditing(null);
    setMsg({ type: 'ok', text: 'Resource updated.' });
    reload();
  }

  return (
    <>
      <div className="page-head"><h1>Manage resources</h1></div>
      <Notice type={msg?.type} onClose={() => setMsg(null)}>{msg?.text}</Notice>

      <div className="card stack" style={{ marginBottom: '1rem' }}>
        <h2>Add a resource</h2>
        <ResourceForm key={data?.total} initial={blank} onSubmit={create} submitLabel="Create resource" />
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && <Empty>No resources yet.</Empty>}
      {data && data.data.length > 0 && (
        <div className="card table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td className="wrap">{r.name}<div className="muted">{r.description}</div></td>
                  <td><Badge value={r.type} /></td>
                  <td>{r.capacity}</td>
                  <td>{r.isActive ? <Badge value="approved" /> : <span className="badge badge-cancelled">inactive</span>}</td>
                  <td>
                    <div className="row">
                      <button className="btn btn-small" onClick={() => setEditing(r)}>Edit</button>
                      <button className="btn btn-small" onClick={() => toggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <ResourceForm initial={editing} onSubmit={save} onCancel={() => setEditing(null)} submitLabel="Save changes" />
        </Modal>
      )}
    </>
  );
}
