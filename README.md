# BE-TEMPLATE

A production-ready Express.js backend template written in TypeScript, featuring Prisma ORM, WebSocket support, Redis caching, Swagger API docs, Sentry error tracking, and OpenTelemetry observability.

## Package Manager Standard

Project ini menggunakan `pnpm` sebagai standar utama.

- `packageManager` sudah dipin di `package.json`.
- Lockfile utama: `pnpm-lock.yaml`.
- Untuk konsistensi tim/CI/VPS, gunakan pnpm di semua environment.

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express v5
- **ORM**: Prisma (MSSQL)
- **Cache**: Redis (ioredis)
- **WebSocket**: Socket.IO
- **Validation**: Zod
- **Logging**: Pino + Pino-Pretty
- **API Docs**: Swagger (swagger-jsdoc + swagger-ui-express)
- **Monitoring**: Sentry, OpenTelemetry
- **Date Utility**: Day.js

## Project Structure

```
src/
├── app.ts                  # Express app setup
├── index.ts                # Entry point
├── prisma.ts               # Prisma client instance
├── config/
│   ├── constants.ts        # App-wide constants
│   ├── redis.ts            # Redis client config
│   ├── sentry.ts           # Sentry config
│   ├── swagger.ts          # Swagger config
│   └── telemetry.ts        # OpenTelemetry config
├── controllers/            # Route controllers
├── middleware/             # Express middleware (error handler, rate limiter, request logger)
├── routes/                 # Route definitions
├── schemas/                # Zod validation schemas
├── services/               # Business logic layer
├── utils/                  # Utility helpers (cache, date, db, logger, graceful shutdown)
└── ws/                     # WebSocket handlers (Socket.IO)
```

## Getting Started

### Prerequisites

- Node.js >= 18
- MSSQL database
- Redis server

### Installation

```bash
pnpm install
```

Jika command `pnpm` belum tersedia (Windows non-admin), gunakan fallback:

```bash
npx -y pnpm@10.32.1 install
```

Setelah install, script `postinstall` otomatis menjalankan Prisma client generation.

### Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="sqlserver://localhost:1433;database=mydb;user=sa;password=yourpassword;trustServerCertificate=true"
REDIS_URL="redis://localhost:6379"
PORT=3000
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
```

### Database

```bash
# Run migrations
pnpm run migrate

# Deploy migrations (production)
pnpm run migrate:deploy

# Generate Prisma client
pnpm run generate

# Seed database
pnpm run seed

# Open Prisma Studio
pnpm run studio
```

## Development

```bash
# Start dev server (with file watching)
pnpm run dev

# Start dev server directly (without helper scripts)
pnpm run dev:direct

# Type check
pnpm run typecheck
```

## Production

```bash
# Build TypeScript
pnpm run build

# Start server
pnpm run start

# Stop server
pnpm run stop

# Restart server
pnpm run restart
```

## API Documentation

Swagger UI is available at `http://localhost:<PORT>/api-docs` when the server is running.

```bash
# Generate docs files
pnpm run docs:generate

# Generate PDF docs
pnpm run docs:pdf

# Generate DOCX docs
pnpm run docs:docx

# Generate all docs
pnpm run docs:all
```

## Scripts

| Script                    | Description                              |
| ------------------------- | ---------------------------------------- |
| `pnpm run dev`            | Start development server with hot reload |
| `pnpm run build`          | Compile TypeScript to `dist/`            |
| `pnpm run start`          | Start production server                  |
| `pnpm run stop`           | Stop the running server                  |
| `pnpm run restart`        | Restart the server                       |
| `pnpm run migrate`        | Run Prisma migrations (dev)              |
| `pnpm run migrate:deploy` | Run Prisma migrations (production)       |
| `pnpm run generate`       | Generate Prisma client                   |
| `pnpm run seed`           | Seed the database                        |
| `pnpm run studio`         | Open Prisma Studio                       |
| `pnpm run bundle:be`      | Bundle backend for distribution          |
| `pnpm run docs:generate`  | Generate API documentation               |

## Hardening Stage 2

Template ini sudah dilengkapi baseline quality guard:

- Pre-commit guard conflict marker via `.githooks/pre-commit`.
- Script checker conflict marker di `scripts/check-conflict-markers.mjs`.
- CI minimum di `.github/workflows/ci.yml` untuk:
  - install (`pnpm install --frozen-lockfile`)
  - conflict check (`pnpm run check:conflicts:all`)
  - typecheck (`pnpm run typecheck`)
  - build (`pnpm run build`)

Aktifkan hooks sekali per clone:

```bash
pnpm run hooks:install
```

## Git Shortcuts

```bash
# Solo workflow (push to main)
pnpm run git:solo

# Team workflow (push to current branch)
pnpm run git:team

# Create new branch
pnpm run git:new <branch-name>
```

## License

ISC
