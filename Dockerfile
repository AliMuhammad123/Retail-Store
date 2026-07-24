# Container image for hosting Retail Manager online.
# Works on Render, Railway, Fly.io, a VPS, or anywhere that runs Docker.
FROM node:22-slim

WORKDIR /app

# Install backend dependencies first (better build caching)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy the application
COPY backend ./backend
COPY frontend ./frontend

# Run in production mode.
# DB_PATH: where the shop database lives. Override in your host's settings —
#   paid plan with a persistent disk -> /data/retail.db
#   free plan (demo only, resets on restart) -> /tmp/retail.db
# DEMO_MODE=1 fills an empty database with sample data for a public demo.
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/data/retail.db

EXPOSE 4000

CMD ["node", "backend/server.js"]
