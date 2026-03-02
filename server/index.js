require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initializeDatabase } = require('./db/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const conversationRoutes = require('./routes/conversations');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

// Socket.IO
const io = new Server(server, {
  cors: { origin: isProd ? true : CLIENT_URL, methods: ['GET', 'POST'], credentials: true }
});

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: isProd ? true : CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limit
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 200, message: { error: 'Too many requests' } }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/conversations', conversationRoutes);

// Health check (для Render)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'ДАЛЕКС', developer: 'Денис Алексеев', time: Date.now() });
});

// В продакшене — отдаём собранный фронтенд из server/dist
if (isProd) {
  const clientBuild = path.join(__dirname, 'dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// WebSocket
setupSocket(io);

// Start
initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`
  ██████╗  █████╗ ██╗     ███████╗██╗  ██╗
  ██╔══██╗██╔══██╗██║     ██╔════╝██║ ██╔╝
  ██║  ██║███████║██║     █████╗  █████╔╝ 
  ██║  ██║██╔══██║██║     ██╔══╝  ██╔═██╗ 
  ██████╔╝██║  ██║███████╗███████╗██║  ██╗
  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝
  🚀 ДАЛЕКС запущен на порту ${PORT}
  👨‍💻 Разработчик: Денис Алексеев
  🌍 Режим: ${isProd ? 'production' : 'development'}
    `);
  });
});

module.exports = { app, server };
