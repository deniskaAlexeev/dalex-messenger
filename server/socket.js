const { v4: uuidv4 } = require('uuid');
const { db } = require('./db/database');
const { authenticateSocket } = require('./middleware/auth');

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

    // Join conversation rooms
    const convs = await db.all('SELECT conversation_id FROM conversation_participants WHERE user_id = ?', [userId]);
    convs.forEach(({ conversation_id }) => socket.join(`conv:${conversation_id}`));

    console.log(`✅ ${username} connected`);

    socket.on('message:send', async (data, callback) => {
      try {
        const { conversationId, content, replyToId } = data;
        if (!content?.trim() || content.length > 4096) return callback?.({ error: 'Invalid message' });

        const participant = await db.get('SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversationId, userId]);
        if (!participant) return callback?.({ error: 'Access denied' });

        const now = Date.now();
        const msgId = uuidv4();

        await db.run(
          'INSERT INTO messages (id, conversation_id, sender_id, content, reply_to_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [msgId, conversationId, userId, content.trim(), replyToId || null, now, now]
        );
        await db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);
        await db.run('UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [now, conversationId, userId]);

        const sender = await db.get('SELECT username, display_name, avatar_color FROM users WHERE id = ?', [userId]);
        let replyTo = null;
        if (replyToId) replyTo = await db.get('SELECT id, content, sender_id FROM messages WHERE id = ?', [replyToId]);

        const message = {
          id: msgId, conversation_id: conversationId, sender_id: userId,
          content: content.trim(), message_type: 'text',
          reply_to_id: replyToId || null, reply_to: replyTo,
          is_edited: 0, is_deleted: 0, created_at: now, updated_at: now,
          username: sender.username, display_name: sender.display_name, avatar_color: sender.avatar_color
        };

        io.to(`conv:${conversationId}`).emit('message:new', message);
        callback?.({ success: true, message });
      } catch (err) {
        console.error('message:send error:', err);
        callback?.({ error: 'Server error' });
      }
    });

    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:start', { userId, username, conversationId });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });

    socket.on('messages:read', async ({ conversationId }) => {
      const now = Date.now();
      await db.run('UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [now, conversationId, userId]);
      socket.to(`conv:${conversationId}`).emit('messages:read', { userId, conversationId, at: now });
    });

    socket.on('message:edit', async ({ conversationId, messageId, content }, callback) => {
      if (!content?.trim()) return callback?.({ error: 'Content required' });
      const msg = await db.get('SELECT * FROM messages WHERE id = ? AND sender_id = ?', [messageId, userId]);
      if (!msg) return callback?.({ error: 'Not found' });

      const now = Date.now();
      await db.run('UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?', [content.trim(), now, messageId]);
      io.to(`conv:${conversationId}`).emit('message:edited', { messageId, conversationId, content: content.trim(), updatedAt: now });
      callback?.({ success: true });
    });

    socket.on('message:delete', async ({ conversationId, messageId }, callback) => {
      const msg = await db.get('SELECT * FROM messages WHERE id = ? AND sender_id = ?', [messageId, userId]);
      if (!msg) return callback?.({ error: 'Not found' });

      await db.run('UPDATE messages SET is_deleted = 1, content = ?, updated_at = ? WHERE id = ?', ['Сообщение удалено', Date.now(), messageId]);
      io.to(`conv:${conversationId}`).emit('message:deleted', { messageId, conversationId });
      callback?.({ success: true });
    });

    socket.on('conversation:join', async ({ conversationId }) => {
      const p = await db.get('SELECT id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [conversationId, userId]);
      if (p) socket.join(`conv:${conversationId}`);
    });

    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          const now = Date.now();
          await db.run('UPDATE users SET is_online = 0, last_seen = ?, updated_at = ? WHERE id = ?', [now, now, userId]);
          io.emit('user:offline', { userId, lastSeen: now });
        }
      }
      console.log(`❌ ${username} disconnected`);
    });
  });
};
