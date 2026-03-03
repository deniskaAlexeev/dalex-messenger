# ДАЛЕКС — Мессенджер

<div align="center">
  <img src="https://img.shields.io/badge/ДАЛЕКС-v1.0.0-4f9cf9?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite" />
</div>

<br/>

**ДАЛЕКС** — современный мессенджер с поддержкой реального времени. Разработчик: **Денис Алексеев**.

---

## ✨ Возможности

- 💬 **Сообщения в реальном времени** — WebSocket (Socket.IO), без задержек
- 👥 **Система друзей** — запросы, принятие, отклонение, поиск пользователей
- 🔐 **Авторизация** — регистрация/вход, JWT токены с автообновлением (refresh tokens)
- 🤖 **Защита от ботов** — SVG CAPTCHA при регистрации и входе
- ✏️ **Редактирование и удаление** сообщений
- ↩️ **Ответы** на сообщения
- 🟢 **Статус онлайн/офлайн** в реальном времени
- 📨 **Индикатор набора текста**
- 🔢 **Счётчик непрочитанных** сообщений
- 🎨 **Кастомизация профиля** — отображаемое имя, описание, цвет аватара
- 📜 **История сообщений** с бесконечной загрузкой (pagination)
- 🌙 **Тёмная тема** — стильный тёмный интерфейс

---

## 🛠 Стек технологий

| Слой | Технологии |
|------|------------|
| Бэкенд | Node.js, Express, Socket.IO |
| База данных | SQLite (better-sqlite3) |
| Фронтенд | React 18, Vite, CSS Modules |
| Аутентификация | JWT (access + refresh tokens) |
| Реальное время | Socket.IO (WebSocket) |
| Защита от ботов | svg-captcha |
| Стейт-менеджмент | Zustand |

---

## 🚀 Быстрый старт

### Требования

- Node.js 18+
- npm 9+

### Установка и запуск

```bash
# 1. Клонировать репозиторий
git clone https://github.com/your-username/dalex-messenger.git
cd dalex-messenger

# 2. Установить все зависимости
npm run install:all

# 3. Настроить переменные окружения сервера
cd server
cp .env.example .env
# Откройте .env и задайте секретные ключи JWT!
cd ..

# 4. Запустить в режиме разработки (сервер + клиент)
npm run dev
```

После запуска:
- 🌐 Клиент: http://localhost:5173
- ⚙️ Сервер API: http://localhost:3001

---

## ⚙️ Конфигурация (.env)

```env
PORT=3001
JWT_SECRET=your_super_secret_key_min_32_chars_change_this
JWT_REFRESH_SECRET=another_secret_key_min_32_chars_change_this
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

> ⚠️ **Важно:** Обязательно замените `JWT_SECRET` и `JWT_REFRESH_SECRET` на длинные случайные строки перед деплоем!

---

## 📦 Деплой на продакшен

### Вариант 1: Один сервер (Express отдаёт фронтенд)

```bash
# 1. Сборка клиента
npm run build

# 2. Настройте .env с NODE_ENV=production и правильным CLIENT_URL
# 3. Запустите сервер
npm start
```

### Вариант 2: Раздельный деплой

**Бэкенд** (например, Railway, Render, VPS):
```bash
cd server
npm install --production
node index.js
```

**Фронтенд** (Vercel, Netlify):
```bash
cd client
npm run build
# Задайте VITE_API_URL=https://your-backend.com в переменных окружения
```

### Вариант 3: Docker (Dockerfile прилагается)

```bash
docker build -t dalex .
docker run -p 3001:3001 -e JWT_SECRET=your_secret dalex
```

---

## 📁 Структура проекта

```
dalex-messenger/
├── server/                    # Node.js бэкенд
│   ├── db/
│   │   └── database.js        # Инициализация SQLite
│   ├── middleware/
│   │   └── auth.js            # JWT middleware
│   ├── routes/
│   │   ├── auth.js            # Авторизация + капча
│   │   ├── users.js           # Профили пользователей
│   │   ├── friends.js         # Система друзей
│   │   └── conversations.js   # Чаты и сообщения
│   ├── socket.js              # WebSocket обработчики
│   ├── index.js               # Точка входа
│   └── .env.example
│
├── client/                    # React фронтенд
│   ├── src/
│   │   ├── components/        # UI компоненты
│   │   ├── pages/             # Страницы
│   │   ├── hooks/             # Zustand сторы и хуки
│   │   ├── utils/             # api.js, socket.js, format.js
│   │   └── styles/            # Глобальные стили
│   └── vite.config.js
│
└── package.json               # Корневой package.json
```

---

## 🗄 База данных

SQLite файл создаётся автоматически при первом запуске по пути `server/data/dalex.db`.

### Схема

- `users` — пользователи
- `refresh_tokens` — токены обновления
- `friend_requests` — запросы в друзья
- `friendships` — список друзей
- `conversations` — диалоги
- `conversation_participants` — участники диалогов
- `messages` — сообщения

---

## 🔒 Безопасность

- ✅ Пароли хешируются bcrypt (12 раундов)
- ✅ JWT с коротким сроком жизни (15 мин) + refresh tokens (30 дней)
- ✅ Ротация refresh tokens при каждом обновлении
- ✅ Rate limiting на все API эндпоинты
- ✅ CAPTCHA при регистрации и входе
- ✅ Helmet.js заголовки безопасности
- ✅ Валидация всех входных данных (express-validator)
- ✅ CORS настроен только на клиентский URL

---

## 👨‍💻 Разработчик

**Денис Алексеев**

---

## 📄 Лицензия

MIT
