const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const svgCaptcha = require('svg-captcha');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { db } = require('../db/database');

const captchaStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of captchaStore.entries()) {
    if (now - val.createdAt > 5 * 60 * 1000) captchaStore.delete(key);
  }
}, 5 * 60 * 1000);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many requests' } });

const generateTokens = (userId, username) => ({
  accessToken: jwt.sign({ id: userId, username }, process.env.JWT_SECRET, { expiresIn: '15m' }),
  refreshToken: jwt.sign({ id: userId, username }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
});

// GET /api/auth/captcha
router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 5, noise: 3, color: true,
    background: '#1a1a2e', width: 180, height: 60, fontSize: 42
  });
  const captchaId = uuidv4();
  captchaStore.set(captchaId, { text: captcha.text.toLowerCase(), createdAt: Date.now() });
  res.json({ captchaId, svg: captcha.data });
});

// POST /api/auth/register
router.post('/register', authLimiter, [
  body('username').trim().isLength({ min: 3, max: 32 }).matches(/^[a-zA-Z0-9_]+$/),
  body('displayName').trim().isLength({ min: 1, max: 64 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('captchaId').notEmpty(),
  body('captchaAnswer').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { username, displayName, email, password, captchaId, captchaAnswer } = req.body;

  const captchaData = captchaStore.get(captchaId);
  if (!captchaData || captchaData.text !== captchaAnswer.toLowerCase()) {
    return res.status(400).json({ error: 'Неверный код с картинки' });
  }
  captchaStore.delete(captchaId);

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(409).json({ error: 'Пользователь с таким именем или email уже существует' });

    const passwordHash = bcrypt.hashSync(password, 12);
    const userId = uuidv4();
    const now = Date.now();
    const colors = ['#4f9cf9', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#06b6d4', '#eab308'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    await db.run(
      'INSERT INTO users (id, username, display_name, email, password_hash, avatar_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, username, displayName, email, passwordHash, avatarColor, now, now]
    );

    const { accessToken, refreshToken } = generateTokens(userId, username);
    await db.run(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), userId, refreshToken, now + 30 * 24 * 60 * 60 * 1000, now]
    );

    const user = await db.get('SELECT id, username, display_name, email, avatar_color, bio FROM users WHERE id = ?', [userId]);
    res.status(201).json({ accessToken, refreshToken, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, [
  body('login').trim().notEmpty(),
  body('password').notEmpty(),
  body('captchaId').notEmpty(),
  body('captchaAnswer').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { login, password, captchaId, captchaAnswer } = req.body;

  const captchaData = captchaStore.get(captchaId);
  if (!captchaData || captchaData.text !== captchaAnswer.toLowerCase()) {
    return res.status(400).json({ error: 'Неверный код с картинки' });
  }
  captchaStore.delete(captchaId);

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [login, login]);
    if (!user) return res.status(401).json({ error: 'Неверные учётные данные' });

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.username);
    const now = Date.now();

    await db.run(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), user.id, refreshToken, now + 30 * 24 * 60 * 60 * 1000, now]
    );
    await db.run('UPDATE users SET is_online = 1, updated_at = ? WHERE id = ?', [now, user.id]);

    res.json({
      accessToken, refreshToken,
      user: { id: user.id, username: user.username, display_name: user.display_name, email: user.email, avatar_color: user.avatar_color, bio: user.bio }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const stored = await db.get('SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > ?', [refreshToken, Date.now()]);
    if (!stored) return res.status(401).json({ error: 'Invalid refresh token' });

    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.id, decoded.username);
    const now = Date.now();

    await db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    await db.run(
      'INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), decoded.id, newRefresh, now + 30 * 24 * 60 * 60 * 1000, now]
    );

    res.json({ accessToken, refreshToken: newRefresh });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
  res.json({ success: true });
});

module.exports = router;
