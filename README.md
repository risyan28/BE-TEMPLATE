# BE-TEMPLATE

A production-ready Express.js backend template written in TypeScript, featuring Prisma ORM, WebSocket support, Redis caching, Swagger API docs, Sentry error tracking, and OpenTelemetry observability.

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
npm install
```

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
npm run migrate

# Deploy migrations (production)
npm run migrate:deploy

# Generate Prisma client
npm run generate

# Seed database
npm run seed

# Open Prisma Studio
npm run studio
```

## Development

```bash
# Start dev server (with file watching)
npm run dev

# Start dev server directly (without helper scripts)
npm run dev:direct
```

## Production

```bash
# Build TypeScript
npm run build

# Start server
npm run start

# Stop server
npm run stop

# Restart server
npm run restart
```

## API Documentation

Swagger UI is available at `http://localhost:<PORT>/api-docs` when the server is running.

```bash
# Generate docs files
npm run docs:generate

# Generate PDF docs
npm run docs:pdf

# Generate DOCX docs
npm run docs:docx

# Generate all docs
npm run docs:all
```

## Scripts

| Script                   | Description                              |
| ------------------------ | ---------------------------------------- |
| `npm run dev`            | Start development server with hot reload |
| `npm run build`          | Compile TypeScript to `dist/`            |
| `npm run start`          | Start production server                  |
| `npm run stop`           | Stop the running server                  |
| `npm run restart`        | Restart the server                       |
| `npm run migrate`        | Run Prisma migrations (dev)              |
| `npm run migrate:deploy` | Run Prisma migrations (production)       |
| `npm run generate`       | Generate Prisma client                   |
| `npm run seed`           | Seed the database                        |
| `npm run studio`         | Open Prisma Studio                       |
| `npm run bundle:be`      | Bundle backend for distribution          |
| `npm run docs:generate`  | Generate API documentation               |

## Git Shortcuts

```bash
# Solo workflow (push to main)
npm run git:solo

# Team workflow (push to current branch)
npm run git:team

# Create new branch
npm run git:new <branch-name>
```

## License

ISC
