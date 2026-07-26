# Comandos canônicos. Ninguém decora sequência de passos.
.PHONY: help dev dev-host up down logs reset test test-web test-py lint lint-web lint-py \
        format fixture gate build-worker install check

SHELL := /bin/bash
COMPOSE := docker compose
VENV := .venv/bin

help: ## mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Ambiente
# ---------------------------------------------------------------------------

dev: ## sobe o ambiente completo (postgres + minio + fake-runpod + web)
	@docker info > /dev/null 2>&1 || { echo "✗ Docker não está rodando. Abra o Docker Desktop e tente de novo."; exit 1; }
	@test -f .env || { echo "→ criando .env a partir de .env.example"; cp .env.example .env; }
	$(COMPOSE) up --build

dev-host: ## sobe só a infraestrutura; a web roda no host (mais rápido no macOS)
	@docker info > /dev/null 2>&1 || { echo "✗ Docker não está rodando. Abra o Docker Desktop e tente de novo."; exit 1; }
	@test -f .env || cp .env.example .env
	$(COMPOSE) up -d postgres minio minio-bootstrap fake-runpod
	@echo "→ infraestrutura de pé. Agora: cd apps/web && npm run dev"

up: ## sobe em segundo plano
	$(COMPOSE) up -d --build

down: ## derruba os serviços (preserva os volumes)
	$(COMPOSE) down

logs: ## logs agregados
	$(COMPOSE) logs -f

reset: ## derruba TUDO e apaga os volumes locais (banco e storage)
	$(COMPOSE) down -v
	@rm -rf fixtures
	@echo "✓ ambiente zerado. Rode 'make fixture' para regenerar a cena sintética."

install: ## instala as dependências dos dois lados
	cd apps/web && npm ci
	python3 -m venv .venv
	$(VENV)/pip install --upgrade pip
	$(VENV)/pip install pytest ruff mypy

# ---------------------------------------------------------------------------
# Qualidade — os mesmos gates que a CI roda
# ---------------------------------------------------------------------------

check: lint test gate ## roda tudo que a CI roda

test: test-py test-web ## testes dos dois lados

test-web:
	cd apps/web && npm run test

test-py:
	$(VENV)/python -m pytest

lint: lint-py lint-web ## lint + typecheck dos dois lados

lint-web:
	cd apps/web && npm run lint && npm run typecheck && npm run format:check

lint-py:
	$(VENV)/ruff check .
	$(VENV)/ruff format --check .

format: ## formata os dois lados
	cd apps/web && npm run format
	$(VENV)/ruff format .

gate: ## gates de licença e de vulnerabilidades
	$(VENV)/python scripts/license_gate.py
	cd apps/web && npm run audit:gate

# ---------------------------------------------------------------------------
# Artefatos
# ---------------------------------------------------------------------------

fixture: ## (re)gera a cena sintética em fixtures/
	$(VENV)/python scripts/make_fixture.py --out fixtures

build-worker: ## constrói a imagem do worker (sem GPU; só valida o build)
	docker build -t logikos-twins-worker:dev ./worker
