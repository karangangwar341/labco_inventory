# Multi-stage Docker build for Zoho Catalyst AppSail or containerized deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and compile NestJS to dist/
RUN npm run prisma:generate
RUN npm run build

# Runner image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and production dependencies
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Note: AppSail will inject X_ZOHO_CATALYST_LISTEN_PORT at runtime.
# EXPOSE is advisory for local and container runners.
EXPOSE 9000 4000

CMD ["node", "dist/main.js"]
