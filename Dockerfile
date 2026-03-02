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

# Build client
RUN cd client && npm run build

# Create data directory
RUN mkdir -p server/data

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server/index.js"]
