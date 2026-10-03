FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY data/owner_assumptions.json ./data/owner_assumptions.json
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUTF8=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=10000
WORKDIR /app
COPY requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements-lock.txt
COPY backend ./backend
COPY scripts ./scripts
COPY data ./data
COPY --from=frontend /build/dist ./dist
EXPOSE 10000
CMD ["sh", "-c", "exec python -X utf8 -m uvicorn backend.app:app --host 0.0.0.0 --port \"${PORT:-10000}\""]
