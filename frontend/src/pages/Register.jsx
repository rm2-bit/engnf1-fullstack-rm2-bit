import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Notice } from '../components/ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form.name, form.email, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      <div className="card">
        <h1>Create an account</h1>
        <Notice type="error">{error}</Notice>
        <form className="form" onSubmit={submit}>
          <label>
            Name
            <input value={form.name} onChange={set('name')} required minLength={2} maxLength={50} autoComplete="name" />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} required maxLength={254} autoComplete="username" />
          </label>
          <label>
            Password (8-64 characters, at least one letter and one digit)
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} maxLength={64} autoComplete="new-password" />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Register'}
          </button>
        </form>
        <p className="muted">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
