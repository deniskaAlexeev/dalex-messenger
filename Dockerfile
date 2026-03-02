FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm install && \
    cd server && npm install --production && cd .. && \
    cd client && npm install && cd ..

# Copy source
COPY . .

# Build client и скопировать в server/dist (откуда сервер его отдаёт)
RUN cd client && npm run build && cp -r dist ../server/dist

# Create data directory
RUN mkdir -p server/data

EXPOSE 10000

ENV NODE_ENV=production
ENV PORT=10000

CMD ["node", "server/index.js"]
