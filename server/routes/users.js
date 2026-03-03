const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

router.get('/me', authenticateToken, async (req, res) => {
  const user = await db.get(
    'SELECT id, username, display_name, email, avatar_color, bio, is_online, last_seen, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.patch('/me', authenticateToken, [
  body('displayName').optional().trim().isLength({ min: 1, max: 64 }),
  body('bio').optional().trim().isLength({ max: 256 }),
  body('avatarColor').optional().matches(/^#[0-9A-Fa-f]{6}$/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { displayName, bio, avatarColor } = req.body;
  const now = Date.now();

  if (displayName !== undefined) await db.run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', [displayName, now, req.user.id]);
  if (bio !== undefined) await db.run('UPDATE users SET bio = ?, updated_at = ? WHERE id = ?', [bio, now, req.user.id]);
  if (avatarColor !== undefined) await db.run('UPDATE users SET avatar_color = ?, updated_at = ? WHERE id = ?', [avatarColor, now, req.user.id]);

  const user = await db.get('SELECT id, username, display_name, email, avatar_color, bio FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

router.get('/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);

  const search = `%${q.trim()}%`;
  const users = await db.all(
    'SELECT id, username, display_name, avatar_color, bio, is_online, last_seen FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20',
    [search, search, req.user.id]
  );

  const result = await Promise.all(users.map(async u => {
    const friendship = await db.get(
      'SELECT id FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      [req.user.id, u.id, u.id, req.user.id]
    );
    const request = await db.get(
      "SELECT id, sender_id, status FROM friend_requests WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status = 'pending'",
      [req.user.id, u.id, u.id, req.user.id]
    );
    return { ...u, isFriend: !!friendship, friendRequest: request || null };
  }));

  res.json(result);
});

router.get('/:id', authenticateToken, async (req, res) => {
  const user = await db.get(
    'SELECT id, username, display_name, avatar_color, bio, is_online, last_seen, created_at FROM users WHERE id = ?',
    [req.params.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
