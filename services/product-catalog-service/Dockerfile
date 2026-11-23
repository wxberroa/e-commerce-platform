FROM node:24-alpine

ENV NODE_ENV=production \
    DB_PATH=/app/data/catalog.db
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Carpeta del archivo SQLite; en docker-compose se monta como volumen.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data

USER node
EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
