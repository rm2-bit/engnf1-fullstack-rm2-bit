import { useEffect } from 'react';

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="state" role="status">
    <span className="spinner" aria-hidden="true" /> {label}
  </div>
);

export const ErrorBox = ({ message, onRetry }) => (
  <div className="alert alert-error" role="alert">
    <span>{message}</span>
    {onRetry && (
      <button className="btn btn-small" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);

export const Empty = ({ children }) => <div className="state empty">{children}</div>;

export const Notice = ({ type = 'info', children, onClose }) =>
  children ? (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && (
        <button className="btn btn-small" onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  ) : null;

export function Badge({ value }) {
  if (!value) return null;
  return <span className={`badge badge-${String(value).toLowerCase().replace(/_/g, '-')}`}>{String(value).replace(/_/g, ' ')}</span>;
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn btn-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button className="btn btn-small" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next →
      </button>
    </nav>
  );
}

export function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
