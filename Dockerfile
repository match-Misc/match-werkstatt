# ===== Stage 1: Frontend bauen =====
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Dependencies zuerst kopieren (Cache-Optimierung)
COPY package.json package-lock.json* ./
RUN npm ci

# Quellcode kopieren und Frontend bauen
COPY . .
RUN npm run build

# ===== Stage 2: Backend =====
FROM node:20-alpine AS backend

WORKDIR /app

# Nur Backend-Dependencies installieren
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Backend-Dateien kopieren
COPY server.cjs ./
COPY mongo-init.js ./
COPY server/ ./server/
COPY scripts/ ./scripts/

# Storage-Verzeichnisse anlegen
RUN mkdir -p storage/uploads storage/cam-files/templates

EXPOSE 3001

CMD ["node", "server.cjs"]

# ===== Stage 3: Frontend (nginx) =====
FROM nginx:alpine AS frontend

# nginx-Konfiguration kopieren
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Gebautes Frontend kopieren
COPY --from=frontend-build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
