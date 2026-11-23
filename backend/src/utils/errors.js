export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const validationError = (message) => new ApiError(400, 'VALIDATION_ERROR', message);
export const unauthenticated = (message = 'Authentication required') => new ApiError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do this') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message) => new ApiError(409, 'CONFLICT', message);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFoundHandler(req, res, next) {
  next(notFound('Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
