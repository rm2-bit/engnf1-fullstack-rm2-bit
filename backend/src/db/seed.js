// Idempotent seed: every insert is ON CONFLICT DO NOTHING, so running it twice adds nothing.
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { classify } from '../utils/classifier.js';
import { pool } from './pool.js';

const USERS = [
  { name: 'Admin Lead', email: 'admin@triagesync.test', password: 'Admin@123', role: 'ADMIN' },
  { name: 'Agent Demo', email: 'user@triagesync.test', password: 'User@123', role: 'USER' },
];

const RESOURCES = [
  { name: 'Conference Room A', type: 'ROOM', capacity: 12, description: 'Video-call ready meeting room' },
  { name: 'Support War Room', type: 'ROOM', capacity: 20, description: 'Large room for incident response' },
  { name: 'Archive Room', type: 'ROOM', capacity: 6, description: 'Closed for renovation', isActive: false },
  { name: 'Device Test Lab', type: 'LAB', capacity: 8, description: 'Bench space for reproducing device bugs' },
  { name: 'Network Lab', type: 'LAB', capacity: 10, description: 'Isolated network for diagnostics' },
  { name: 'Packet Analyzer Rig', type: 'EQUIPMENT', capacity: 1, description: 'Wire-level traffic capture' },
  { name: 'Remote Desktop Kit', type: 'EQUIPMENT', capacity: 2, description: 'Screen-share kit for live troubleshooting' },
  { name: 'Spare Laptop Pool', type: 'EQUIPMENT', capacity: 4, description: 'Clean laptops for reproductions' },
];

// category/priority default to the classifier's output; set them explicitly to simulate agent work.
const TICKETS = [
  { id: 'seed-001', subject: 'Refund request for duplicate charge', body: 'I was charged twice for my subscription. Please refund the extra payment.', status: 'RESOLVED', reviewed: true, assignee: true },
  { id: 'seed-002', subject: 'Invoice missing for March', body: 'Could you send me the invoice for last month?' },
  { id: 'seed-003', subject: 'Cannot sign in after password reset', body: 'The reset link works but I still cannot sign in to my account.' },
  { id: 'seed-004', subject: 'Locked out of admin account', body: 'Our whole team is locked out of the admin console, please help.' },
  { id: 'seed-005', subject: 'My package has not arrived', body: 'Ordered two weeks ago and the tracking page shows no movement.', status: 'IN_PROGRESS', reviewed: true, assignee: true },
  { id: 'seed-006', subject: 'Wrong shipping address on order', body: 'I entered the wrong address. Can the delivery be redirected?' },
  { id: 'seed-007', subject: 'App crash when uploading files', body: 'The app crashes with a blank screen whenever I upload a file.', status: 'RESOLVED', reviewed: true, assignee: true },
  { id: 'seed-008', subject: 'Error 500 on dashboard', body: 'The dashboard shows a server error and fails to load.' },
  { id: 'seed-009', subject: 'Production down after deploy', body: 'Everything is broken since the latest deploy, production down for all users.' },
  { id: 'seed-010', subject: 'Add dark mode', body: 'Would love a dark theme for night time use.', priority: 'LOW' },
  { id: 'seed-011', subject: 'Export tickets to CSV', body: 'Please let us export the ticket list as a spreadsheet file.' },
  { id: 'seed-012', subject: "<script>alert('xss')</script> Refund not working", body: '<img src=x onerror=alert(1)> <b>bold</b> please check my invoice' },
  { id: 'seed-013', subject: 'Notification emails missing', body: 'Notification emails never show up in my inbox.', category: 'BUG', status: 'IN_PROGRESS', reviewed: true },
  { id: 'seed-014', subject: 'Payment page hangs', body: 'The payment page spins forever and then shows an exception.' },
  { id: 'seed-015', subject: 'Support chat widget idea', body: 'A small chat bubble on the pricing page would help new visitors.', priority: 'LOW' },
  { id: 'seed-016', subject: 'Search results look strange', body: 'Searching for 100% matches shows unrelated rows. Is _ treated as a wildcard?' },
];

async function main() {
  const users = {};
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, config.bcryptCost);
    await pool.query(
      `INSERT INTO users (name, email, "passwordHash", role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, hash, u.role],
    );
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
    users[u.role] = rows[0].id;
  }

  for (const r of RESOURCES) {
    await pool.query(
      `INSERT INTO resources (name, type, capacity, description, "isActive") VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lower(name)) DO NOTHING`,
      [r.name, r.type, r.capacity, r.description, r.isActive ?? true],
    );
  }

  let newTickets = 0;
  for (const t of TICKETS) {
    const auto = classify(t.subject, t.body);
    const category = t.category ?? auto.category;
    const res = await pool.query(
      `INSERT INTO tickets ("externalId", subject, body, "autoCategory", category, "isHumanOverride",
                            priority, status, "assigneeId", "isReviewed")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("externalId") DO NOTHING RETURNING id`,
      [t.id, t.subject, t.body, auto.category, category, category !== auto.category, t.priority ?? auto.priority,
       t.status ?? 'OPEN', t.assignee ? users.USER : null, t.reviewed ?? false],
    );
    // Audit rows only for freshly inserted tickets, so a second run stays a no-op.
    if (res.rowCount === 1) {
      newTickets++;
      const id = res.rows[0].id;
      const events = [];
      if (category !== auto.category) events.push(['category', auto.category, category]);
      if (t.status && t.status !== 'OPEN') events.push(['status', 'OPEN', t.status]);
      for (const [field, oldValue, newValue] of events) {
        await pool.query(
          `INSERT INTO ticket_events ("ticketId", field, "oldValue", "newValue", actor) VALUES ($1, $2, $3, $4, $5)`,
          [id, field, oldValue, newValue, 'user@triagesync.test'],
        );
      }
    }
  }
  console.log(`Seed complete (${newTickets} new tickets inserted this run).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
