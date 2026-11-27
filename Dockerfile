# Downora: API + web app on one port, with FFmpeg for conversions.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && VITE_DOWNORA_API_URL=same-origin pnpm --filter @downora/web build \
  && mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    PORT=8787 \
    WEB_DIR=/app/apps/web/dist \
    DATA_DIR=/data
VOLUME /data
EXPOSE 8787
USER node
CMD ["pnpm", "--filter", "@downora/api", "start"]
