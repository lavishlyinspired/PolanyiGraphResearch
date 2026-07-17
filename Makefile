COMPOSE = docker compose -f infrastructure/docker/docker-compose.yml

.PHONY: test lint ui serve demo up down logs clean

test:
	.venv/bin/python -m pytest

lint:
	.venv/bin/python -m ruff check packages apps

ui:
	cd apps/studio && npm run build

serve:
	.venv/bin/polanyi serve

demo:
	.venv/bin/polanyi init-demo && .venv/bin/polanyi generate

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f api

clean:
	$(COMPOSE) down -v
