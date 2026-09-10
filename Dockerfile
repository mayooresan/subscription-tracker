# Stage 1: Build frontend and compile production dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 native bindings
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

# Copy source code and build React frontend assets to dist/
COPY . .
RUN npm run build

# Prune devDependencies while preserving compiled native modules
RUN npm prune --omit=dev

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Prepare persistent data directory with node user ownership
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy production dependencies and built assets
COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node src/server ./src/server

USER node

EXPOSE 3000

CMD ["node", "src/server/index.js"]
