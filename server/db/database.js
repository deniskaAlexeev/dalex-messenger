const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// На Render.com используем примонтированный диск /data (постоянное хранилище)
// Локально — папка server/data
const isProd = process.env.NODE_ENV === 'production';
const hasPersistentDisk = isProd && fs.existsSync('/data');
const DB_DIR = hasPersistentDisk ? '/data' : path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'dalex.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const rawDb = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB connection error:', err);
});

rawDb.serialize(() => {
  rawDb.run('PRAGMA journal_mode = WAL');
  rawDb.run('PRAGMA foreign_keys = ON');
  rawDb.run('PRAGMA synchronous = NORMAL');
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
  const stmts = [
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
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cp_user ON conversation_participants(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fr_receiver ON friend_requests(receiver_id, status)`
  ];

  for (const stmt of stmts) {
    await db.run(stmt).catch(() => {});
  }

  console.log('✅ Database initialized at', DB_PATH);
}

module.exports = { db, initializeDatabase };
