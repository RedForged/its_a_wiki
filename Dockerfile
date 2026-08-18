FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY . .

# Create persistent data directory and grant permissions to non-root user
RUN mkdir -p /data && chown -R node:node /app /data

# Use built-in non-root node user
USER node

# Environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# Expose web port
EXPOSE 3000

# Persistent storage volume
VOLUME ["/data"]

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# Start the server
CMD ["node", "server.js"]
