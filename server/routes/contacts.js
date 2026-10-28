import express from 'express';
import { one, all, run, tx } from '../db.js';
import { HttpError, owned, requireFields, toInt, isEmail } from '../http.js';

export const contactsRouter = express.Router();
export const listsRouter = express.Router();

const contactOut = (c) => {
  let fields = {};
  try { fields = JSON.parse(c.fields || '{}'); } catch { /* ignore */ }
  return { ...c, fields, lists: c.list_ids ? String(c.list_ids).split(',').map(Number) : [] };
};

// ---------- contacts ----------

contactsRouter.get('/', (req, res) => {
  const page = Math.max(1, toInt(req.query.page, 1));
  const size = Math.min(200, Math.max(10, toInt(req.query.size, 50)));
  const where = ['c.user_id = ?'];
  const params = [req.user.id];
  if (req.query.q) {
    where.push('(c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  if (req.query.status) { where.push('c.status = ?'); params.push(req.query.status); }
  if (req.query.list) { where.push('c.id IN (SELECT contact_id FROM list_contacts WHERE list_id = ?)'); params.push(toInt(req.query.list)); }
  const w = where.join(' AND ');
  const total = one(`SELECT COUNT(*) AS n FROM contacts c WHERE ${w}`, ...params).n;
  const rows = all(
    `SELECT c.*, (SELECT group_concat(list_id) FROM list_contacts WHERE contact_id = c.id) AS list_ids
       FROM contacts c WHERE ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    ...params, size, (page - 1) * size,
  );
  res.json({ contacts: rows.map(contactOut), total, page, size });
});

function upsertContact(userId, { email, first_name = '', last_name = '', fields = {} }, { overwrite = true } = {}) {
  const existing = one('SELECT * FROM contacts WHERE user_id = ? AND email = ?', userId, email);
  if (existing) {
    if (overwrite) {
      let merged = {};
      try { merged = JSON.parse(existing.fields || '{}'); } catch { /* ignore */ }
      Object.assign(merged, fields);
      run('UPDATE contacts SET first_name = ?, last_name = ?, fields = ? WHERE id = ?',
        first_name || existing.first_name, last_name || existing.last_name, JSON.stringify(merged), existing.id);
    }
    return { id: existing.id, created: false };
  }
  const suppressed = one('SELECT reason FROM suppressions WHERE user_id = ? AND email = ?', userId, email);
  const status = suppressed ? (suppressed.reason === 'bounced' ? 'bounced' : 'unsubscribed') : 'subscribed';
  const { lastInsertRowid } = run(
    'INSERT INTO contacts (user_id, email, first_name, last_name, fields, status) VALUES (?, ?, ?, ?, ?, ?)',
    userId, email, first_name, last_name, JSON.stringify(fields), status,
  );
  return { id: Number(lastInsertRowid), created: true };
}

function assertLists(userId, ids = []) {
  const clean = [...new Set(ids.map(Number).filter(Boolean))];
  for (const id of clean) owned(one('SELECT id FROM lists WHERE id = ? AND user_id = ?', id, userId), 'List');
  return clean;
}

contactsRouter.post('/', (req, res) => {
  requireFields(req.body, ['email']);
  const email = String(req.body.email).trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  const lists = assertLists(req.user.id, req.body.lists);
  const id = tx(() => {
    const r = upsertContact(req.user.id, { email, first_name: req.body.first_name?.trim(), last_name: req.body.last_name?.trim(), fields: req.body.fields || {} });
    for (const l of lists) run('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)', l, r.id);
    return r.id;
  });
  res.status(201).json({ contact: contactOut(one(`SELECT c.*, (SELECT group_concat(list_id) FROM list_contacts WHERE contact_id = c.id) AS list_ids FROM contacts c WHERE id = ?`, id)) });
});

contactsRouter.post('/import', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw new HttpError(400, 'The file has no rows to import.');
  if (rows.length > 100000) throw new HttpError(400, 'Import up to 100,000 contacts at a time.');
  let listIds = assertLists(req.user.id, req.body.lists);
  if (req.body.new_list) {
    const { lastInsertRowid } = run('INSERT INTO lists (user_id, name) VALUES (?, ?)', req.user.id, String(req.body.new_list).trim());
    listIds = [...listIds, Number(lastInsertRowid)];
  }
  const result = { created: 0, updated: 0, invalid: 0, invalid_samples: [] };
  tx(() => {
    const seen = new Set();
    for (const r of rows) {
      const email = String(r.email || '').trim().toLowerCase();
      if (!isEmail(email)) {
        result.invalid++;
        if (result.invalid_samples.length < 5) result.invalid_samples.push(String(r.email || '(empty)'));
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      const fields = {};
      for (const [k, v] of Object.entries(r.fields || {})) if (v !== undefined && v !== '') fields[k] = String(v);
      const u = upsertContact(req.user.id, { email, first_name: String(r.first_name || '').trim(), last_name: String(r.last_name || '').trim(), fields }, { overwrite: req.body.overwrite !== false });
      u.created ? result.created++ : result.updated++;
      for (const l of listIds) run('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)', l, u.id);
    }
  });
  res.json(result);
});

const findContact = (req) => owned(one('SELECT * FROM contacts WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Contact');

contactsRouter.patch('/:id', (req, res) => {
  const c = findContact(req);
  const status = ['subscribed', 'unsubscribed', 'bounced'].includes(req.body.status) ? req.body.status : c.status;
  tx(() => {
    run('UPDATE contacts SET first_name = ?, last_name = ?, fields = ?, status = ? WHERE id = ?',
      req.body.first_name ?? c.first_name, req.body.last_name ?? c.last_name,
      req.body.fields ? JSON.stringify(req.body.fields) : c.fields, status, c.id);
    if (status === 'subscribed' && c.status !== 'subscribed') run('DELETE FROM suppressions WHERE user_id = ? AND email = ?', req.user.id, c.email);
    if (status !== 'subscribed' && c.status === 'subscribed') {
      run('INSERT OR IGNORE INTO suppressions (user_id, email, reason) VALUES (?, ?, ?)', req.user.id, c.email, status === 'bounced' ? 'bounced' : 'unsubscribed');
    }
    if (Array.isArray(req.body.lists)) {
      const lists = assertLists(req.user.id, req.body.lists);
      run('DELETE FROM list_contacts WHERE contact_id = ?', c.id);
      for (const l of lists) run('INSERT INTO list_contacts (list_id, contact_id) VALUES (?, ?)', l, c.id);
    }
  });
  res.json({ ok: true });
});

contactsRouter.post('/bulk', (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) throw new HttpError(400, 'Select at least one contact.');
  const ph = ids.map(() => '?').join(',');
  const mine = all(`SELECT id FROM contacts WHERE user_id = ? AND id IN (${ph})`, req.user.id, ...ids).map((r) => r.id);
  tx(() => {
    if (req.body.action === 'delete') {
      for (const id of mine) run('DELETE FROM contacts WHERE id = ?', id);
    } else if (req.body.action === 'add_to_list' || req.body.action === 'remove_from_list') {
      const [list] = assertLists(req.user.id, [req.body.list_id]);
      if (!list) throw new HttpError(400, 'Choose a list.');
      for (const id of mine) {
        if (req.body.action === 'add_to_list') run('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)', list, id);
        else run('DELETE FROM list_contacts WHERE list_id = ? AND contact_id = ?', list, id);
      }
    } else {
      throw new HttpError(400, 'Unknown action.');
    }
  });
  res.json({ ok: true, affected: mine.length });
});

contactsRouter.delete('/:id', (req, res) => {
  run('DELETE FROM contacts WHERE id = ?', findContact(req).id);
  res.json({ ok: true });
});

// ---------- lists ----------

listsRouter.get('/', (req, res) => {
  res.json({
    lists: all(
      `SELECT l.*,
              (SELECT COUNT(*) FROM list_contacts lc WHERE lc.list_id = l.id) AS contact_count,
              (SELECT COUNT(*) FROM list_contacts lc JOIN contacts c ON c.id = lc.contact_id WHERE lc.list_id = l.id AND c.status = 'subscribed') AS subscribed_count
         FROM lists l WHERE l.user_id = ? ORDER BY l.id DESC`,
      req.user.id,
    ),
  });
});

listsRouter.post('/', (req, res) => {
  requireFields(req.body, ['name']);
  const { lastInsertRowid } = run('INSERT INTO lists (user_id, name, description) VALUES (?, ?, ?)', req.user.id, String(req.body.name).trim(), String(req.body.description || ''));
  res.status(201).json({ list: one('SELECT * FROM lists WHERE id = ?', lastInsertRowid) });
});

const findList = (req) => owned(one('SELECT * FROM lists WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'List');

listsRouter.patch('/:id', (req, res) => {
  const l = findList(req);
  run('UPDATE lists SET name = ?, description = ? WHERE id = ?', String(req.body.name ?? l.name).trim(), String(req.body.description ?? l.description), l.id);
  res.json({ ok: true });
});

listsRouter.delete('/:id', (req, res) => {
  const l = findList(req);
  if (req.query.with_contacts === '1') {
    run(`DELETE FROM contacts WHERE id IN (SELECT contact_id FROM list_contacts WHERE list_id = ?)
           AND id NOT IN (SELECT contact_id FROM list_contacts WHERE list_id != ?)`, l.id, l.id);
  }
  run('DELETE FROM lists WHERE id = ?', l.id);
  res.json({ ok: true });
});
