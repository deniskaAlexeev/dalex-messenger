const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  const friends = await db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.is_online, u.last_seen
     FROM friendships f
     JOIN users u ON (CASE WHEN f.user1_id = ? THEN f.user2_id ELSE f.user1_id END = u.id)
     WHERE f.user1_id = ? OR f.user2_id = ?
     ORDER BY u.is_online DESC, u.display_name ASC`,
    [req.user.id, req.user.id, req.user.id]
  );
  res.json(friends);
});

router.get('/requests', authenticateToken, async (req, res) => {
  const requests = await db.all(
    `SELECT fr.id, fr.created_at, u.id as sender_id, u.username, u.display_name, u.avatar_color
     FROM friend_requests fr JOIN users u ON fr.sender_id = u.id
     WHERE fr.receiver_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    [req.user.id]
  );
  res.json(requests);
});

router.get('/requests/sent', authenticateToken, async (req, res) => {
  const requests = await db.all(
    `SELECT fr.id, fr.created_at, u.id as receiver_id, u.username, u.display_name, u.avatar_color
     FROM friend_requests fr JOIN users u ON fr.receiver_id = u.id
     WHERE fr.sender_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    [req.user.id]
  );
  res.json(requests);
});

router.post('/request/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });

  const target = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = await db.get(
    'SELECT id FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
    [req.user.id, userId, userId, req.user.id]
  );
  if (existing) return res.status(409).json({ error: 'Already friends' });

  const existingReq = await db.get(
    "SELECT id FROM friend_requests WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status = 'pending'",
    [req.user.id, userId, userId, req.user.id]
  );
  if (existingReq) return res.status(409).json({ error: 'Request already sent' });

  const now = Date.now();
  const requestId = uuidv4();
  await db.run(
    "INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
    [requestId, req.user.id, userId, now, now]
  );
  res.status(201).json({ id: requestId, message: 'Request sent' });
});

router.post('/accept/:requestId', authenticateToken, async (req, res) => {
  const request = await db.get(
    "SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = 'pending'",
    [req.params.requestId, req.user.id]
  );
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const now = Date.now();
  await db.run("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?", [now, request.id]);

  const [u1, u2] = [request.sender_id, request.receiver_id].sort();
  await db.run('INSERT OR IGNORE INTO friendships (id, user1_id, user2_id, created_at) VALUES (?, ?, ?, ?)', [uuidv4(), u1, u2, now]);
  res.json({ success: true });
});

router.post('/decline/:requestId', authenticateToken, async (req, res) => {
  const request = await db.get(
    "SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = 'pending'",
    [req.params.requestId, req.user.id]
  );
  if (!request) return res.status(404).json({ error: 'Request not found' });

  await db.run("UPDATE friend_requests SET status = 'declined', updated_at = ? WHERE id = ?", [Date.now(), request.id]);
  res.json({ success: true });
});

router.delete('/:userId', authenticateToken, async (req, res) => {
  await db.run(
    'DELETE FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
    [req.user.id, req.params.userId, req.params.userId, req.user.id]
  );
  res.json({ success: true });
});

module.exports = router;
