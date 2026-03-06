require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const compression = require('compression');
const logger = require('./logger');


// ✅ БАГ-6: Проверяем обязательные переменные окружения
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error('❌ JWT_SECRET или JWT_REFRESH_SECRET не заданы! Остановка сервера.');
  process.exit(1);
}

const { initializeDatabase, db } = require('./db/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const conversationRoutes = require('./routes/conversations');
const feedRoutes = require('./routes/feed');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

// ✅ ОПТ-5: gzip/brotli сжатие — уменьшает трафик в 3-5x
app.use(compression({ threshold: 1024 })); // сжимать ответы > 1KB

// ✅ Доверяем прокси (обязательно для Render / Railway / любого хостинга)
app.set('trust proxy', 1);

// Socket.IO
const io = new Server(server, {
  cors: { origin: isProd ? true : CLIENT_URL, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 15e6 // 15MB для голосовых/изображений
});

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: isProd ? true : CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// HTTP Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api/health')) {
      logger.http(req.method, req.path, res.statusCode, Date.now() - start);
    }
  });
  next();
});

// Rate limit
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, подождите минуту' }
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/feed', feedRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'ДАЛЕКС', uptime: process.uptime(), time: Date.now() });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// В продакшене отдаём фронтенд
if (isProd) {
  const clientBuild = path.join(__dirname, 'dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

setupSocket(io);

initializeDatabase().then(() => {
  // ✅ БАГ-5: Очистка устаревших refresh-токенов каждый час
  setInterval(async () => {
    try {
      const result = await db.run('DELETE FROM refresh_tokens WHERE expires_at < ?', [Date.now()]);
      if (result.changes > 0) logger.info(`Cleaned up ${result.changes} expired refresh token(s)`);
    } catch (err) {
      logger.error('Token cleanup error', err);
    }
  }, 60 * 60 * 1000);

  server.listen(PORT, () => {
    logger.success(`ДАЛЕКС запущен на порту ${PORT} [${isProd ? 'production' : 'development'}]`);
    logger.info(`👨‍💻 Разработчик: Денис Алексеев`);
  });
}).catch(err => {
  logger.error('Ошибка инициализации БД', err);
  process.exit(1);
});

// Ловим необработанные ошибки
process.on('uncaughtException', err => logger.error('uncaughtException', err));
process.on('unhandledRejection', err => logger.error('unhandledRejection', err));

module.exports = { app, server };
