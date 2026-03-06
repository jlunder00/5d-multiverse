.PHONY: build server client migrate reset-db

# Build all packages in dependency order
build:
	pnpm --filter @5d/types build
	pnpm --filter @5d/engine build
	pnpm --filter @5d/stub build

# Run the server in dev (watch) mode
server: build
	pnpm --filter @5d/server dev

# Run the client in dev mode
client:
	pnpm --filter @5d/client dev

# Run DB migration
migrate:
	pnpm --filter @5d/server db:migrate

# Wipe SQLite DB and re-migrate
reset-db:
	rm -f apps/server/data.db apps/server/data.db-shm apps/server/data.db-wal
	pnpm --filter @5d/server db:migrate
