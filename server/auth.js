import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { APP_SECRET } from './config.js';
import { one, run } from './db.js';
import { HttpError, requireFields } from './http.js';

const sign = (user) => jwt.sign({ uid: user.id }, APP_SECRET, { expiresIn: '30d' });

export const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, timezone: u.timezone,
  delay_min: u.delay_min, delay_max: u.delay_max, company: u.company, address: u.address,
});

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Sign in to continue.'));
  try {
    const { uid } = jwt.verify(token, APP_SECRET);
    const user = one('SELECT * FROM users WHERE id = ?', uid);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Sign in again.'));
  }
}

export const authRouter = express.Router();

authRouter.post('/signup', (req, res) => {
  requireFields(req.body, ['email', 'password']);
  const email = String(req.body.email).trim().toLowerCase();
  const { password, name = '', timezone } = req.body;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (String(password).length < 8) throw new HttpError(400, 'Use a password with at least 8 characters.');
  if (one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  const hash = bcrypt.hashSync(String(password), 10);
  const { lastInsertRowid } = run(
    'INSERT INTO users (email, name, password_hash, timezone) VALUES (?, ?, ?, ?)',
    email, String(name).trim(), hash, timezone || 'Asia/Kolkata',
  );
  const user = one('SELECT * FROM users WHERE id = ?', lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  requireFields(req.body, ['email', 'password']);
  const user = one('SELECT * FROM users WHERE email = ?', String(req.body.email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(req.body.password), user.password_hash)) {
    throw new HttpError(401, 'That email and password don’t match.');
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
