/** Logs method, path (without the query string), status and duration for each request. */
export function requestLogger(req, res, next) {
  if (req.path === '/api/health') return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  return next();
}
