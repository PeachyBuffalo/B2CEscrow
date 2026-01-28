.PHONY: install db-up db-down start start-nodocker

DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/b2c_escrow
PORT ?= 3000
USE_DOCKER ?= 1

install:
	npm install

db-up:
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required for db-up"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Docker daemon is not running. Start Docker or run: make start-nodocker"; exit 1; }
	@if docker ps -a --format '{{.Names}}' | grep -q '^b2c-escrow-postgres$$'; then \
		docker start b2c-escrow-postgres; \
	else \
		docker run --name b2c-escrow-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=b2c_escrow -p 5432:5432 -d postgres:16; \
	fi

db-down:
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required for db-down"; exit 1; }
	@docker stop b2c-escrow-postgres >/dev/null 2>&1 || true

start: install
	@if [ "$(USE_DOCKER)" = "1" ]; then $(MAKE) db-up; fi
	DATABASE_URL=$(DATABASE_URL) PORT=$(PORT) npm run dev

start-nodocker: install
	@echo "Starting without Docker. Ensure Postgres is running and DATABASE_URL is set."
	DATABASE_URL=$(DATABASE_URL) PORT=$(PORT) npm run dev
