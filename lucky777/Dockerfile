# ---- stage 1: build the frontend --------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ---- stage 2: the server -----------------------------------------------------
FROM python:3.12-slim
WORKDIR /srv

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# main.py serves frontend/dist when it sits next to the backend dir
COPY --from=frontend /build/dist ../frontend/dist

# the SQLite file lives here; mount a volume over /srv/data to keep it
ENV LUCKY777_DATABASE_URL=sqlite+aiosqlite:////srv/data/lucky777.db
RUN mkdir -p /srv/data
VOLUME /srv/data

EXPOSE 8000
# $PORT is honoured for platforms that inject it (Render, Railway, Heroku-alikes)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
