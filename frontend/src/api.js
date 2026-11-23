const BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;

let token = null;
try {
  token = localStorage.getItem('token');
} catch {
  /* storage unavailable */
}

let onUnauthorized = () => {};

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem('token', value);
    else localStorage.removeItem('token');
  } catch {
    /* storage unavailable */
  }
}
export const getToken = () => token;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body, headers = {}, query } = {}) {
  let qs = '';
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== '' && v != null) params.set(k, v);
    qs = params.toString() ? `?${params}` : '';
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error?.code || 'ERROR', data?.error?.message || `Request failed (${res.status})`);
  }
  return data;
}
