# GraphOS — API + Studio in one image (multi-stage: UI build, then Python)

FROM node:22-slim AS studio
WORKDIR /studio
COPY apps/studio/package.json apps/studio/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY apps/studio/ .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src/ src/
RUN pip install --no-cache-dir ".[semantic,graph]"
COPY --from=studio /studio/dist apps/studio/dist
COPY infrastructure/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8000
CMD ["/entrypoint.sh"]
