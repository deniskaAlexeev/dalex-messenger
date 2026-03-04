const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logger');

const FEED_MAX = 15;

// Удаляет посты старше 15-го — вызывается после каждой публикации
async function trimFeed() {
  try {
    const old = await db.all(
      'SELECT id FROM feed_posts ORDER BY created_at DESC LIMIT -1 OFFSET ?',
      [FEED_MAX]
    );
    for (const row of old) {
      await db.run('DELETE FROM feed_posts WHERE id = ?', [row.id]);
    }
    if (old.length > 0) logger.info(`Feed trimmed: removed ${old.length} old post(s)`);
  } catch (err) {
    logger.error('trimFeed error', err);
  }
}

// GET /api/feed
router.get('/', authenticateToken, async (req, res) => {
  try {
    const posts = await db.all(`
      SELECT fp.id, fp.user_id, fp.content, fp.image_data, fp.created_at, fp.updated_at,
        u.username, u.display_name, u.avatar_color,
        (SELECT COUNT(*) FROM feed_likes fl WHERE fl.post_id = fp.id) as likes_count,
        (SELECT COUNT(*) FROM feed_comments fc WHERE fc.post_id = fp.id) as comments_count,
        (SELECT COUNT(*) FROM feed_likes fl2 WHERE fl2.post_id = fp.id AND fl2.user_id = ?) as liked_by_me
      FROM feed_posts fp
      JOIN users u ON u.id = fp.user_id
      ORDER BY fp.created_at DESC
      LIMIT ?
    `, [req.user.id, FEED_MAX]);

    res.json(posts.map(p => ({ ...p, liked_by_me: p.liked_by_me > 0 })));
  } catch (err) {
    logger.error('GET /feed error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/feed/:postId/comments
router.get('/:postId/comments', authenticateToken, async (req, res) => {
  try {
    const comments = await db.all(`
      SELECT fc.id, fc.content, fc.created_at, u.id as user_id, u.username, u.display_name, u.avatar_color
      FROM feed_comments fc JOIN users u ON u.id = fc.user_id
      WHERE fc.post_id = ? ORDER BY fc.created_at ASC
    `, [req.params.postId]);
    res.json(comments);
  } catch (err) {
    logger.error('GET /feed/:postId/comments error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/feed/:postId
router.delete('/:postId', authenticateToken, async (req, res) => {
  try {
    const post = await db.get('SELECT id FROM feed_posts WHERE id = ? AND user_id = ?', [req.params.postId, req.user.id]);
    if (!post) return res.status(404).json({ error: 'Пост не найден' });
    await db.run('DELETE FROM feed_posts WHERE id = ?', [req.params.postId]);
    res.json({ success: true });
  } catch (err) {
    logger.error('DELETE /feed/:postId error', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
module.exports.trimFeed = trimFeed;
