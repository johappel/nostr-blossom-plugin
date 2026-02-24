FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN corepack enable && pnpm add --no-frozen-lockfile @fastify/cors fastify sharp tsx
COPY src ./src
EXPOSE 8787
CMD ["pnpm", "start"]
