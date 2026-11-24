import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

try {
  await pool.query('SELECT 1');
  console.log('Database connection OK');
} catch (err) {
  console.error(`Cannot connect to the database: ${err.message}`);
  console.error('Check DATABASE_URL and DB_SSL in your environment.');
  process.exit(1);
}

const server = createApp().listen(config.port, () => {
  console.log(`TriageSync API listening on :${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  });
}
