const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

const getDbPath = () => {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.NODE_ENV === 'production') {
    // Railway: переменная RAILWAY_VOLUME_MOUNT_PATH или /data
    const vol = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (vol && fs.existsSync(vol)) return path.join(vol, 'dalex.db');
    if (fs.existsSync('/data')) return '/data/dalex.db';
    // fallback: /tmp (не сбрасывается при hot reload, сбрасывается при деплое)
    const dir = '/tmp/dalex';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'dalex.db');
  }
  const dir = path.join(__dirname, '../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'dalex.db');
};

const DB_PATH = getDbPath();
logger.info(`📦 DB: ${DB_PATH}`);

const rawDb = new sqlite3.Database(DB_PATH, (err) => {
  if (err) logger.error('DB connection error', err);
});

rawDb.serialize(() => {
  rawDb.run('PRAGMA journal_mode = WAL');
  rawDb.run('PRAGMA foreign_keys = ON');
  rawDb.run('PRAGMA synchronous = NORMAL');
  rawDb.run('PRAGMA cache_size = -8000'); // 8MB cache
});

const db = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      rawDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      rawDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      rawDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },
  exec(sql) {
    return new Promise((resolve, reject) => {
      rawDb.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

async function initializeDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, avatar_color TEXT DEFAULT '#4f9cf9',
      bio TEXT DEFAULT '', is_online INTEGER DEFAULT 0,
      last_seen INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(sender_id, receiver_id)
    )`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY, user1_id TEXT NOT NULL, user2_id TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user1_id, user2_id)
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, type TEXT DEFAULT 'direct', name TEXT, created_by TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS conversation_participants (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL, last_read_at INTEGER DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(conversation_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
      content TEXT NOT NULL, message_type TEXT DEFAULT 'text', reply_to_id TEXT,
      is_edited INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
    )`,
    // ── Лента новостей ──
    `CREATE TABLE IF NOT EXISTS feed_posts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', image_data TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS feed_likes (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(post_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS feed_comments (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
      content TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL,
      user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(message_id, user_id)
    )`,
    // Индексы
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cp_user ON conversation_participants(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fr_receiver ON friend_requests(receiver_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_feed_posts ON feed_posts(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_feed_likes ON feed_likes(post_id)`,
    `CREATE INDEX IF NOT EXISTS idx_feed_comments ON feed_comments(post_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(message_id)`,
    // ✅ ОПТ-6: индексы для поиска и производительности
    `CREATE INDEX IF NOT EXISTS idx_users_search ON users(username, display_name)`,
    `CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`,
    `CREATE INDEX IF NOT EXISTS idx_friendships ON friend_requests(sender_id, receiver_id, status)`
  ];

  for (const stmt of tables) {
    await db.run(stmt).catch(err => {
      // Игнорируем "already exists", логируем остальное
      if (!err.message.includes('already exists')) logger.warn('DB init warning: ' + err.message);
    });
  }
  // ── Миграции для существующих БД ──
  await db.run("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL").catch(() => {});
  await db.run("ALTER TABLE users ADD COLUMN avatar_data TEXT DEFAULT NULL").catch(() => {});

  logger.success('Database initialized');
}

module.exports = { db, initializeDatabase };
