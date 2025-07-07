# Multi-stage Dockerfile for LLM Validation Platform
# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Runtime stage
FROM node:18-alpine AS runtime

# Install system dependencies
RUN apk add --no-cache \
    ca-certificates \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodeuser -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nodeuser:nodejs /app/src ./src
COPY --from=builder --chown=nodeuser:nodejs /app/database ./database
COPY --from=builder --chown=nodeuser:nodejs /app/logs ./logs

# Create necessary directories
RUN mkdir -p /app/uploads /app/temp && \
    chown -R nodeuser:nodejs /app/uploads /app/temp

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/server.js"]

# Labels for metadata
LABEL version="1.0.0" \
      description="LLM Validation Platform" \
      maintainer="LLM Validation Platform Team" \
      org.opencontainers.image.title="LLM Validation Platform" \
      org.opencontainers.image.description="Comprehensive LLM validation platform with TDD-like validation" \
      org.opencontainers.image.vendor="LLM Validation Platform Team" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.schema-version="1.0"