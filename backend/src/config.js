import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  dbSsl: process.env.DB_SSL !== 'false',
  dbSslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  bcryptCost: Math.max(10, Number(process.env.BCRYPT_COST || 10)),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 100),
  authRateLimitWindowMs: 15 * 60_000,
};
