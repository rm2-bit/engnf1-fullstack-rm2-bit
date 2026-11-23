// B6 check: N simultaneous bookings for the same slot -> exactly one 201, the rest 409.
// Uses N freshly registered users so the "max 3 active bookings" rule cannot mask a race bug.
// Usage: API_URL=https://your-api npm run test:concurrency [-- 10]
const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '') + '/api';
const N = Number(process.argv[2] || 10);

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const run = Date.now();
const users = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const email = `race${run}-${i}@triagesync.test`;
    const password = 'Race1234';
    await call('/auth/register', { method: 'POST', body: { name: `Racer ${i}`, email, password } });
    const login = await call('/auth/login', { method: 'POST', body: { email, password } });
    return login.data.token;
  }),
);

const admin = (await call('/auth/login', { method: 'POST', body: { email: 'admin@triagesync.test', password: 'Admin@123' } })).data.token;
const resources = await call('/resources?type=LAB', { token: admin });
const resource = resources.data.data.find((r) => r.isActive);

// Random slot 2-28 days out so repeated runs do not collide with earlier bookings.
const start = new Date(Date.now() + (2 + Math.floor(Math.random() * 26)) * 86_400_000);
start.setUTCMinutes(Math.random() < 0.5 ? 0 : 30, 0, 0);
start.setUTCHours(Math.floor(Math.random() * 20));
const end = new Date(start.getTime() + 60 * 60_000);
const payload = { resourceId: resource.id, startTime: start.toISOString(), endTime: end.toISOString(), purpose: 'Concurrency race test' };

const results = await Promise.all(users.map((token) => call('/bookings', { method: 'POST', body: payload, token })));
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;
console.log(`Slot ${payload.startTime} on "${resource.name}" -> status counts:`, tally);

const winnerIndex = results.findIndex((r) => r.status === 201);
if (winnerIndex >= 0) {
  await call(`/bookings/${results[winnerIndex].data.id}/cancel`, { method: 'PATCH', token: users[winnerIndex] });
}

const pass = tally[201] === 1 && tally[409] === N - 1;
console.log(pass ? 'PASS: exactly one 201 and the rest 409' : 'FAIL: expected exactly one 201 and the rest 409');
process.exit(pass ? 0 : 1);
