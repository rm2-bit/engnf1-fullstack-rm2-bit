import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const read = (name) => readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const DROP_INDEXES = `
DROP INDEX IF EXISTS idx_tickets_created;
DROP INDEX IF EXISTS idx_tickets_status;
DROP INDEX IF EXISTS idx_tickets_category;
DROP INDEX IF EXISTS idx_tickets_priority;
DROP INDEX IF EXISTS idx_tickets_subject_trgm;
DROP INDEX IF EXISTS idx_tickets_body_trgm;
`;

async function main() {
  const flag = process.argv[2];
  if (flag === '--indexes') {
    await pool.query(await read('./indexes.sql'));
    console.log('Ticket indexes created.');
  } else if (flag === '--drop-indexes') {
    await pool.query(DROP_INDEXES);
    console.log('Ticket indexes dropped.');
  } else {
    await pool.query(await read('./schema.sql'));
    console.log('Schema is up to date.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
