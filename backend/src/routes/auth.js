import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { asyncHandler, conflict, unauthenticated, validationError } from '../utils/errors.js';
import { trimmedString, validateEmail, validatePassword } from '../utils/validate.js';

const router = Router();

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt });
// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', config.bcryptCost);

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = trimmedString(body.name, 2, 50, 'name');
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const passwordHash = await bcrypt.hash(password, config.bcryptCost);
    try {
      // Role is hard-coded: public registration can only ever create USER accounts.
      const { rows } = await query(
        `INSERT INTO users (name, email, "passwordHash", role) VALUES ($1, $2, $3, 'USER')
         RETURNING id, name, email, role, "createdAt"`,
        [name, email, passwordHash],
      );
      res.status(201).json({ user: publicUser(rows[0]) });
    } catch (err) {
      if (err.code === '23505') throw conflict('Email is already registered');
      throw err;
    }
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw validationError('Email and password are required');
    }
    const { rows } = await query(
      'SELECT id, name, email, role, "passwordHash", "createdAt" FROM users WHERE email = $1',
      [email.trim().toLowerCase()],
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) throw unauthenticated('Invalid email or password');
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT id, name, email, role, "createdAt" FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) throw unauthenticated('Account no longer exists');
    res.json({ user: publicUser(rows[0]) });
  }),
);

export default router;
