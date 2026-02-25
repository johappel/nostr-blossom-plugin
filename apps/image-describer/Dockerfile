FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS build
COPY package.json tsconfig.json ./
COPY src ./src
RUN corepack enable \
	&& pnpm add @fastify/cors fastify sharp \
	&& pnpm add -D @types/node tsx typescript \
	&& pnpm run build

FROM base AS prod-deps
COPY package.json ./
RUN corepack enable \
	&& pnpm add --prod @fastify/cors fastify sharp

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
EXPOSE 8787
CMD ["node", "dist/server.js"]
