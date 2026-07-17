COMPOSE = docker compose -f infrastructure/docker/docker-compose.yml

.PHONY: test lint ui serve demo up down logs clean

test:
	.venv/bin/python -m pytest

lint:
	.venv/bin/python -m ruff check packages apps tests

ui:
	cd apps/studio && npm run build

serve:
	.venv/bin/graphos serve

demo:
	.venv/bin/graphos init-demo && .venv/bin/graphos generate

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f api

clean:
	$(COMPOSE) down -v
