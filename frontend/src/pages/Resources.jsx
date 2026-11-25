import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Empty, ErrorBox, Pagination, Spinner } from '../components/ui.jsx';
import { useApi, useDebounced } from '../hooks.js';

export default function Resources() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [minCapacity, setMinCapacity] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);
  const debouncedCap = useDebounced(minCapacity);

  const { data, loading, error, reload } = useApi(
    () => api('/resources', { query: { search: debouncedSearch, type, minCapacity: debouncedCap, page } }),
    [debouncedSearch, type, debouncedCap, page],
  );

  const reset = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <>
      <div className="page-head">
        <h1>Resources</h1>
      </div>
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="form-wide">
          <label>
            Search by name
            <input type="search" value={search} onChange={reset(setSearch)} maxLength={100} />
          </label>
          <label>
            Type
            <select value={type} onChange={reset(setType)}>
              <option value="">All types</option>
              <option value="ROOM">Room</option>
              <option value="LAB">Lab</option>
              <option value="EQUIPMENT">Equipment</option>
            </select>
          </label>
          <label>
            Minimum capacity
            <input type="number" min="1" max="500" value={minCapacity} onChange={reset(setMinCapacity)} />
          </label>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && <Empty>No resources match your filters.</Empty>}
      {data && data.data.length > 0 && (
        <div className="grid" style={{ opacity: loading ? 0.6 : 1 }}>
          {data.data.map((r) => (
            <Link key={r.id} to={`/resources/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className={`card stack resource-card resource-${r.type.toLowerCase()}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>{r.name}</h3>
                  <Badge value={r.type} />
                </div>
                <div className="muted">Capacity {r.capacity}</div>
                <div>{r.description || <span className="muted">No description</span>}</div>
                {!r.isActive && <span className="badge badge-rejected">Inactive</span>}
                <span className="muted">View availability and book →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
