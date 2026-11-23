import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthenticated } from '../utils/errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn, // brief: must expire within 24h
  });
}

export function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthenticated());
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return next(unauthenticated('Invalid or expired token'));
  }
}

export const requireAdmin = (req, res, next) =>
  req.user.role === 'ADMIN' ? next() : next(forbidden('Admin access required'));
