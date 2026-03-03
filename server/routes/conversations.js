const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  const convs = await db.all(
    `SELECT c.id, c.type, c.name, c.updated_at, cp.last_read_at
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     ORDER BY c.updated_at DESC`,
    [req.user.id]
  );

  const result = await Promise.all(convs.map(async conv => {
    const unreadRow = await db.get(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND created_at > ? AND sender_id != ? AND is_deleted = 0',
      [conv.id, conv.last_read_at || 0, req.user.id]
    );
    const lastMsg = await db.get(
      'SELECT id, content, sender_id, created_at, is_deleted, message_type FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1',
      [conv.id]
    );
    let otherUser = null;
    let memberCount = 0;
    if (conv.type === 'direct') {
      otherUser = await db.get(
        `SELECT u.id, u.username, u.display_name, u.avatar_color, u.is_online, u.last_seen
         FROM conversation_participants cp JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = ? AND cp.user_id != ?`,
        [conv.id, req.user.id]
      );
    } else {
      const mc = await db.get('SELECT COUNT(*) as cnt FROM conversation_participants WHERE conversation_id = ?', [conv.id]);
      memberCount = mc?.cnt || 0;
    }
    return { ...conv, unread_count: unreadRow?.cnt || 0, last_message: lastMsg, other_user: otherUser, member_count: memberCount };
  }));

  res.json(result);
});

router.post('/direct/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot message yourself' });

  const target = await db.get('SELECT id, username, display_name, avatar_color FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = await db.get(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
     WHERE c.type = 'direct' LIMIT 1`,
    [req.user.id, userId]
  );

  if (existing) {
    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [existing.id]);
    return res.json({ ...conv, other_user: target, created: false });
  }

  const now = Date.now();
  const convId = uuidv4();
  await db.run("INSERT INTO conversations (id, type, created_by, created_at, updated_at) VALUES (?, 'direct', ?, ?, ?)", [convId, req.user.id, now, now]);
  await db.run('INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)', [uuidv4(), convId, req.user.id, now]);
  await db.run('INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)', [uuidv4(), convId, userId, now]);

  const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [convId]);
  res.status(201).json({ ...conv, other_user: target, created: true });
});

router.get('/:id/messages', authenticateToken, async (req, res) => {
  const participant = await db.get('SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!participant) return res.status(403).json({ error: 'Access denied' });

  const before = req.query.before ? parseInt(req.query.before) : Date.now() + 1000;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const messages = await db.all(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
       m.reply_to_id, m.is_edited, m.is_deleted, m.created_at, m.updated_at,
       u.username, u.display_name, u.avatar_color
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? AND m.created_at < ?
     ORDER BY m.created_at DESC LIMIT ?`,
    [req.params.id, before, limit]
  );

  // Attach reply_to for each message
  const withReplies = await Promise.all(messages.reverse().map(async m => {
    let reply_to = null;
    if (m.reply_to_id) {
      reply_to = await db.get('SELECT id, content, sender_id FROM messages WHERE id = ?', [m.reply_to_id]);
    }
    return { ...m, reply_to };
  }));

  await db.run('UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [Date.now(), req.params.id, req.user.id]);
  res.json(withReplies);
});

router.patch('/:convId/messages/:msgId', authenticateToken, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

  const msg = await db.get('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND sender_id = ?', [req.params.msgId, req.params.convId, req.user.id]);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  await db.run('UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?', [content.trim(), Date.now(), msg.id]);
  res.json({ success: true });
});

router.delete('/:convId/messages/:msgId', authenticateToken, async (req, res) => {
  const msg = await db.get('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND sender_id = ?', [req.params.msgId, req.params.convId, req.user.id]);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  await db.run('UPDATE messages SET is_deleted = 1, content = ?, updated_at = ? WHERE id = ?', ['Сообщение удалено', Date.now(), msg.id]);
  res.json({ success: true });
});

module.exports = router;

// POST /api/conversations/group — создать групповой чат
router.post('/group', authenticateToken, async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название группы обязательно' });
  if (!Array.isArray(memberIds) || memberIds.length < 1) return res.status(400).json({ error: 'Добавьте хотя бы одного участника' });

  const now = Date.now();
  const convId = require('uuid').v4();

  await db.run(
    "INSERT INTO conversations (id, type, name, created_by, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)",
    [convId, name.trim(), req.user.id, now, now]
  );

  // Добавить создателя
  await db.run('INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)',
    [require('uuid').v4(), convId, req.user.id, now]);

  // Добавить участников
  for (const uid of memberIds) {
    const u = await db.get('SELECT id FROM users WHERE id = ?', [uid]);
    if (u) {
      await db.run('INSERT OR IGNORE INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)',
        [require('uuid').v4(), convId, uid, now]);
    }
  }

  const memberCount = await db.get('SELECT COUNT(*) as cnt FROM conversation_participants WHERE conversation_id = ?', [convId]);
  const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [convId]);
  res.status(201).json({ ...conv, member_count: memberCount?.cnt || 0 });
});
