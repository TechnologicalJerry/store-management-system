# ==============================================================================
# Multi-stage Dockerfile for Store Management System Fastify Backend
# ==============================================================================

# --- Stage 1: Dependencies Cache ---
FROM node:22-alpine AS deps
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for compilation)
RUN npm ci

# --- Stage 2: Builder ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json package.json ./
COPY prisma/ ./prisma/
COPY src/ ./src/

# Generate Prisma client and compile TypeScript into JavaScript (dist)
RUN npx prisma generate && npm run build

# --- Stage 3: Production Runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Copy dependency manifests and install production-only dependencies
COPY package.json package-lock.json ./
COPY prisma/ ./prisma/
RUN npm ci --omit=dev && npm cache clean --force

# Copy generated Prisma client artifacts from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Switch to standard non-root user provided by node alpine image
USER node

# Expose server HTTP port
EXPOSE 3000

# Container healthcheck targeting process liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application using compiled JavaScript entrypoint
CMD ["node", "dist/server.js"]
