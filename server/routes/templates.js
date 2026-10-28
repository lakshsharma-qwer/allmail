import express from 'express';
import { one, all, run, nowIso } from '../db.js';
import { owned, requireFields } from '../http.js';
import { STARTERS } from '../starters.js';

export const templatesRouter = express.Router();

templatesRouter.get('/', (req, res) => {
  res.json({
    templates: all('SELECT id, name, subject, html, updated_at, created_at FROM templates WHERE user_id = ? ORDER BY updated_at DESC', req.user.id),
    starters: STARTERS,
  });
});

templatesRouter.get('/:id', (req, res) => {
  res.json({ template: owned(one('SELECT * FROM templates WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Template') });
});

templatesRouter.post('/', (req, res) => {
  requireFields(req.body, ['name']);
  const { lastInsertRowid } = run('INSERT INTO templates (user_id, name, subject, html) VALUES (?, ?, ?, ?)',
    req.user.id, String(req.body.name).trim(), String(req.body.subject || ''), String(req.body.html || ''));
  res.status(201).json({ template: one('SELECT * FROM templates WHERE id = ?', lastInsertRowid) });
});

templatesRouter.patch('/:id', (req, res) => {
  const t = owned(one('SELECT * FROM templates WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Template');
  run('UPDATE templates SET name = ?, subject = ?, html = ?, updated_at = ? WHERE id = ?',
    String(req.body.name ?? t.name), String(req.body.subject ?? t.subject), String(req.body.html ?? t.html), nowIso(), t.id);
  res.json({ template: one('SELECT * FROM templates WHERE id = ?', t.id) });
});

templatesRouter.post('/:id/duplicate', (req, res) => {
  const t = owned(one('SELECT * FROM templates WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Template');
  const { lastInsertRowid } = run('INSERT INTO templates (user_id, name, subject, html) VALUES (?, ?, ?, ?)', req.user.id, `${t.name} (copy)`, t.subject, t.html);
  res.status(201).json({ template: one('SELECT * FROM templates WHERE id = ?', lastInsertRowid) });
});

templatesRouter.delete('/:id', (req, res) => {
  const t = owned(one('SELECT id FROM templates WHERE id = ? AND user_id = ?', req.params.id, req.user.id), 'Template');
  run('DELETE FROM templates WHERE id = ?', t.id);
  res.json({ ok: true });
});
