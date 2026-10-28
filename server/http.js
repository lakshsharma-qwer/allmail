export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === null || String(body[f]).trim() === '');
  if (missing.length) throw new HttpError(400, `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
}

// Wrap async handlers so rejected promises reach the error middleware (Express 4).
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function owned(row, what = 'Item') {
  if (!row) throw new HttpError(404, `${what} not found.`);
  return row;
}

export const toInt = (v, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
