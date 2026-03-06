const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logger');

// ✅ ОПТ-2: GET /api/conversations — один большой запрос вместо N+1
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1 запрос: все чаты + unread count + последнее сообщение через subquery
    const convs = await db.all(`
      SELECT
        c.id, c.type, c.name, c.updated_at, cp.last_read_at,
        (
          SELECT COUNT(*) FROM messages m
          WHERE m.conversation_id = c.id
            AND m.created_at > COALESCE(cp.last_read_at, 0)
            AND m.sender_id != ?
            AND m.is_deleted = 0
        ) as unread_count,
        lm.id       as lm_id,
        lm.content  as lm_content,
        lm.sender_id as lm_sender_id,
        lm.created_at as lm_created_at,
        lm.is_deleted as lm_is_deleted,
        lm.message_type as lm_message_type
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
      LEFT JOIN messages lm ON lm.id = (
        SELECT id FROM messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC LIMIT 1
      )
      ORDER BY c.updated_at DESC
    `, [userId, userId]);

    if (convs.length === 0) return res.json([]);

    // 1 запрос: собираем ID всех direct-чатов и берём "других" пользователей батчем
    const directIds = convs.filter(c => c.type === 'direct').map(c => c.id);
    let otherUsersMap = {};
    if (directIds.length > 0) {
      const placeholders = directIds.map(() => '?').join(',');
      const others = await db.all(`
        SELECT cp.conversation_id, u.id, u.username, u.display_name, u.avatar_color, u.is_online, u.last_seen
        FROM conversation_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.conversation_id IN (${placeholders}) AND cp.user_id != ?
      `, [...directIds, userId]);
      for (const o of others) otherUsersMap[o.conversation_id] = o;
    }

    // 1 запрос: кол-во участников для групп
    const groupIds = convs.filter(c => c.type === 'group').map(c => c.id);
    let memberCountMap = {};
    if (groupIds.length > 0) {
      const placeholders = groupIds.map(() => '?').join(',');
      const counts = await db.all(`
        SELECT conversation_id, COUNT(*) as cnt
        FROM conversation_participants
        WHERE conversation_id IN (${placeholders})
        GROUP BY conversation_id
      `, groupIds);
      for (const row of counts) memberCountMap[row.conversation_id] = row.cnt;
    }

    // Собираем результат — 0 дополнительных запросов
    const result = convs.map(conv => ({
      id: conv.id,
      type: conv.type,
      name: conv.name,
      updated_at: conv.updated_at,
      unread_count: conv.unread_count || 0,
      last_message: conv.lm_id ? {
        id: conv.lm_id,
        content: conv.lm_content,
        sender_id: conv.lm_sender_id,
        created_at: conv.lm_created_at,
        is_deleted: conv.lm_is_deleted,
        message_type: conv.lm_message_type,
      } : null,
      other_user: conv.type === 'direct' ? (otherUsersMap[conv.id] || null) : null,
      member_count: conv.type === 'group' ? (memberCountMap[conv.id] || 0) : 0,
    }));

    res.json(result);
  } catch (err) {
    logger.error('GET /conversations error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/conversations/direct/:userId
router.post('/direct/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) return res.status(400).json({ error: 'Нельзя написать самому себе' });

    const target = await db.get('SELECT id, username, display_name, avatar_color FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    const existing = await db.get(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
      WHERE c.type = 'direct' LIMIT 1
    `, [req.user.id, userId]);

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
  } catch (err) {
    logger.error('POST /direct error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ БАГ-1: /group ПЕРЕД module.exports
// POST /api/conversations/group
router.post('/group', authenticateToken, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Название группы обязательно' });
    if (!Array.isArray(memberIds) || memberIds.length < 1) return res.status(400).json({ error: 'Добавьте хотя бы одного участника' });

    const now = Date.now();
    const convId = uuidv4();
    await db.run(
      "INSERT INTO conversations (id, type, name, created_by, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)",
      [convId, name.trim(), req.user.id, now, now]
    );
    await db.run('INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), convId, req.user.id, now]);
    for (const uid of memberIds) {
      const u = await db.get('SELECT id FROM users WHERE id = ?', [uid]);
      if (u && uid !== req.user.id) {
        await db.run('INSERT OR IGNORE INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)',
          [uuidv4(), convId, uid, now]);
      }
    }
    const memberCount = await db.get('SELECT COUNT(*) as cnt FROM conversation_participants WHERE conversation_id = ?', [convId]);
    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [convId]);
    res.status(201).json({ ...conv, member_count: memberCount?.cnt || 0 });
  } catch (err) {
    logger.error('POST /group error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const participant = await db.get(
      'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!participant) return res.status(403).json({ error: 'Нет доступа' });

    const before = req.query.before ? parseInt(req.query.before) : Date.now() + 1000;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const messages = await db.all(`
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
        m.reply_to_id, m.is_edited, m.is_deleted, m.created_at, m.updated_at,
        u.username, u.display_name, u.avatar_color
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ? AND m.created_at < ?
      ORDER BY m.created_at DESC LIMIT ?
    `, [req.params.id, before, limit]);

    const withReplies = await Promise.all(messages.reverse().map(async m => {
      let reply_to = null;
      if (m.reply_to_id) {
        reply_to = await db.get('SELECT id, content, sender_id, message_type FROM messages WHERE id = ?', [m.reply_to_id]);
      }
      return { ...m, reply_to };
    }));

    await db.run('UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
      [Date.now(), req.params.id, req.user.id]);
    res.json(withReplies);
  } catch (err) {
    logger.error('GET /:id/messages error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH message
router.patch('/:convId/messages/:msgId', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Нужен текст' });
    const msg = await db.get('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND sender_id = ?',
      [req.params.msgId, req.params.convId, req.user.id]);
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
    await db.run('UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?',
      [content.trim(), Date.now(), msg.id]);
    res.json({ success: true });
  } catch (err) {
    logger.error('PATCH message error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE message
router.delete('/:convId/messages/:msgId', authenticateToken, async (req, res) => {
  try {
    const msg = await db.get('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND sender_id = ?',
      [req.params.msgId, req.params.convId, req.user.id]);
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
    await db.run('UPDATE messages SET is_deleted = 1, content = ?, updated_at = ? WHERE id = ?',
      ['Сообщение удалено', Date.now(), msg.id]);
    res.json({ success: true });
  } catch (err) {
    logger.error('DELETE message error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
