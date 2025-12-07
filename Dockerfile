FROM node:20-slim AS dependencies

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com/ && \
    npm config set fetch-retries 3 && \
    npm config set fetch-retry-factor 10 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000

COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com/ --prefer-offline --no-audit --no-fund


FROM node:20-slim AS builder

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm config set registry https://registry.npmmirror.com/

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run build


FROM node:20-slim AS runner

RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY <<'EOF' /app/start.sh
#!/bin/sh
echo "======================================"
echo "E-PPT Application Starting..."
echo "======================================"
echo "PORT: $PORT"
echo "NODE_ENV: $NODE_ENV"
echo "NEXT_PUBLIC_BIZY_ENDPOINT: $NEXT_PUBLIC_BIZY_ENDPOINT"
echo "======================================"

exec node server.js
EOF

RUN chmod +x /app/start.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:$PORT/ || exit 1

CMD ["/app/start.sh"]
