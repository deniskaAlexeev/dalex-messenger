const { v4: uuidv4 } = require('uuid');
const { db } = require('./db/database');
const { authenticateSocket } = require('./middleware/auth');
const logger = require('./logger');

const onlineUsers = new Map();

module.exports = (io) => {
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    const username = socket.user.username;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    if (onlineUsers.get(userId).size === 1) {
      await db.run('UPDATE users SET is_online = 1, updated_at = ? WHERE id = ?', [Date.now(), userId]);
      socket.broadcast.emit('user:online', { userId });
    }

    const convs = await db.all('SELECT conversation_id FROM conversation_participants WHERE user_id = ?', [userId]);
    convs.forEach(({ conversation_id }) => socket.join(`conv:${conversation_id}`));

    logger.info(`SOCKET connected: ${username} (${userId})`);

    // ─── ОТПРАВКА СООБЩЕНИЯ ───────────────────────────────────────────────
    socket.on('message:send', async (data, callback) => {
      try {
        const { conversationId, content, replyToId, messageType = 'text' } = data;

        // Валидация
        if (!content) return callback?.({ error: 'Пустое сообщение' });
        if (messageType === 'text' && !content.trim()) return callback?.({ error: 'Пустое сообщение' });
        if (content.length > 15 * 1024 * 1024) return callback?.({ error: 'Сообщение слишком большое' });

        const participant = await db.get(
          'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
          [conversationId, userId]
        );
        if (!participant) return callback?.({ error: 'Нет доступа к этому чату' });

        const now = Date.now();
        const msgId = uuidv4();
        const finalContent = messageType === 'text' ? content.trim() : content;

        await db.run(
          'INSERT INTO messages (id, conversation_id, sender_id, content, message_type, reply_to_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [msgId, conversationId, userId, finalContent, messageType, replyToId || null, now, now]
        );
        await db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);
        await db.run(
          'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
          [now, conversationId, userId]
        );

        const sender = await db.get('SELECT username, display_name, avatar_color FROM users WHERE id = ?', [userId]);
        let replyTo = null;
        if (replyToId) {
          replyTo = await db.get(
            'SELECT id, content, sender_id, message_type FROM messages WHERE id = ?',
            [replyToId]
          );
        }

        const message = {
          id: msgId,
          conversation_id: conversationId,
          sender_id: userId,
          content: finalContent,
          message_type: messageType,
          reply_to_id: replyToId || null,
          reply_to: replyTo,
          is_edited: 0,
          is_deleted: 0,
          created_at: now,
          updated_at: now,
          username: sender.username,
          display_name: sender.display_name,
          avatar_color: sender.avatar_color
        };

        io.to(`conv:${conversationId}`).emit('message:new', message);
        callback?.({ success: true, message });

        logger.info(`MSG [${messageType}] from ${username} in conv ${conversationId}`);
      } catch (err) {
        logger.error('message:send error', err);
        callback?.({ error: 'Ошибка сервера: ' + err.message });
      }
    });

    // ─── TYPING ───────────────────────────────────────────────────────────
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:start', { userId, username, conversationId });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });

    // ─── ПРОЧИТАНО ────────────────────────────────────────────────────────
    socket.on('messages:read', async ({ conversationId }) => {
      const now = Date.now();
      await db.run(
        'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
        [now, conversationId, userId]
      );
      socket.to(`conv:${conversationId}`).emit('messages:read', { userId, conversationId, at: now });
    });

    // ─── РЕДАКТИРОВАТЬ СООБЩЕНИЕ ──────────────────────────────────────────
    socket.on('message:edit', async ({ conversationId, messageId, content }, callback) => {
      try {
        if (!content?.trim()) return callback?.({ error: 'Пустое содержимое' });
        const msg = await db.get(
          'SELECT * FROM messages WHERE id = ? AND sender_id = ? AND message_type = ?',
          [messageId, userId, 'text']
        );
        if (!msg) return callback?.({ error: 'Сообщение не найдено' });

        const now = Date.now();
        await db.run(
          'UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?',
          [content.trim(), now, messageId]
        );
        io.to(`conv:${conversationId}`).emit('message:edited', {
          messageId, conversationId, content: content.trim(), updatedAt: now
        });
        callback?.({ success: true });
      } catch (err) {
        logger.error('message:edit error', err);
        callback?.({ error: 'Ошибка сервера' });
      }
    });

    // ─── УДАЛИТЬ СООБЩЕНИЕ ────────────────────────────────────────────────
    socket.on('message:delete', async ({ conversationId, messageId }, callback) => {
      try {
        const msg = await db.get(
          'SELECT * FROM messages WHERE id = ? AND sender_id = ?',
          [messageId, userId]
        );
        if (!msg) return callback?.({ error: 'Сообщение не найдено' });

        await db.run(
          'UPDATE messages SET is_deleted = 1, content = ?, updated_at = ? WHERE id = ?',
          ['Сообщение удалено', Date.now(), messageId]
        );
        io.to(`conv:${conversationId}`).emit('message:deleted', { messageId, conversationId });
        callback?.({ success: true });
      } catch (err) {
        logger.error('message:delete error', err);
        callback?.({ error: 'Ошибка сервера' });
      }
    });

    // ─── ПРИСОЕДИНИТЬСЯ К КОМНАТЕ ─────────────────────────────────────────
    socket.on('conversation:join', async ({ conversationId }) => {
      const p = await db.get(
        'SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
      if (p) socket.join(`conv:${conversationId}`);
    });

    // ─── НОВЫЙ ПОСТ В ЛЕНТУ ───────────────────────────────────────────────
    socket.on('feed:post', async (data, callback) => {
      try {
        const { content, imageData } = data;
        if (!content?.trim() && !imageData) return callback?.({ error: 'Пустой пост' });
        if (content && content.length > 5000) return callback?.({ error: 'Пост слишком длинный' });

        const now = Date.now();
        const postId = uuidv4();
        const finalImage = imageData || null;

        await db.run(
          'INSERT INTO feed_posts (id, user_id, content, image_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [postId, userId, content?.trim() || '', finalImage, now, now]
        );

        const author = await db.get(
          'SELECT id, username, display_name, avatar_color FROM users WHERE id = ?',
          [userId]
        );

        const post = {
          id: postId,
          user_id: userId,
          content: content?.trim() || '',
          image_data: finalImage,
          likes_count: 0,
          comments_count: 0,
          liked_by_me: false,
          created_at: now,
          updated_at: now,
          author
        };

        io.emit('feed:new_post', post);
        callback?.({ success: true, post });
        logger.info(`FEED: new post from ${username}`);
      } catch (err) {
        logger.error('feed:post error', err);
        callback?.({ error: 'Ошибка сервера' });
      }
    });

    // ─── ЛАЙК ПОСТА ──────────────────────────────────────────────────────
    socket.on('feed:like', async ({ postId }, callback) => {
      try {
        const existing = await db.get(
          'SELECT id FROM feed_likes WHERE post_id = ? AND user_id = ?',
          [postId, userId]
        );
        if (existing) {
          await db.run('DELETE FROM feed_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
          const row = await db.get('SELECT COUNT(*) as cnt FROM feed_likes WHERE post_id = ?', [postId]);
          io.emit('feed:like_update', { postId, likes_count: row.cnt, liked_by: userId, action: 'unlike' });
          callback?.({ liked: false, likes_count: row.cnt });
        } else {
          await db.run(
            'INSERT INTO feed_likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)',
            [uuidv4(), postId, userId, Date.now()]
          );
          const row = await db.get('SELECT COUNT(*) as cnt FROM feed_likes WHERE post_id = ?', [postId]);
          io.emit('feed:like_update', { postId, likes_count: row.cnt, liked_by: userId, action: 'like' });
          callback?.({ liked: true, likes_count: row.cnt });
        }
      } catch (err) {
        logger.error('feed:like error', err);
        callback?.({ error: 'Ошибка сервера' });
      }
    });

    // ─── КОММЕНТАРИЙ ─────────────────────────────────────────────────────
    socket.on('feed:comment', async ({ postId, content }, callback) => {
      try {
        if (!content?.trim()) return callback?.({ error: 'Пустой комментарий' });
        const now = Date.now();
        const commentId = uuidv4();
        await db.run(
          'INSERT INTO feed_comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
          [commentId, postId, userId, content.trim(), now]
        );
        const author = await db.get(
          'SELECT id, username, display_name, avatar_color FROM users WHERE id = ?',
          [userId]
        );
        const row = await db.get('SELECT COUNT(*) as cnt FROM feed_comments WHERE post_id = ?', [postId]);
        const comment = { id: commentId, post_id: postId, content: content.trim(), created_at: now, author };
        io.emit('feed:new_comment', { comment, comments_count: row.cnt });
        callback?.({ success: true, comment });
      } catch (err) {
        logger.error('feed:comment error', err);
        callback?.({ error: 'Ошибка сервера' });
      }
    });

    // ─── ОТКЛЮЧЕНИЕ ──────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          const now = Date.now();
          await db.run(
            'UPDATE users SET is_online = 0, last_seen = ?, updated_at = ? WHERE id = ?',
            [now, now, userId]
          );
          io.emit('user:offline', { userId, lastSeen: now });
        }
      }
      logger.info(`SOCKET disconnected: ${username}`);
    });
  });
};
