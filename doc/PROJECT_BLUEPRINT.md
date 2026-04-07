# Project Blueprint - QC Assistant Approval Quotation (Backend)

Dokumen ini jadi acuan kerangka pengembangan backend ke depan.
Fokus: Express + TypeScript + Prisma template untuk API service, websocket realtime, caching, observability, dan deployment yang stabil.

## 1. Tujuan Project

- Nama resmi project: **QC Assistant Approval Quotation**.
- Membangun backend API untuk kebutuhan operasional QC/manufacturing.
- Menyediakan layanan HTTP + realtime socket yang reliabel.
- Menyediakan arsitektur siap scale: modular, testable, observability-ready.
- Menyediakan baseline engineering workflow yang konsisten untuk tim.

## 1.1 Standar Package Manager

- Package manager utama yang direkomendasikan: **pnpm**.
- Alasan pemilihan:
  - Instalasi dependency lebih cepat dan hemat disk dibanding npm/yarn classic.
  - Lockfile deterministik (`pnpm-lock.yaml`) cocok untuk server VPS dan CI/CD.
  - Cocok untuk monorepo atau multi-project FE/BE dengan standar sama.
- Untuk local development dan VPS, gunakan Corepack agar versi package manager konsisten.
- Seluruh workflow command default sudah menggunakan pnpm.

## 2. Arsitektur Tingkat Tinggi

- Runtime: Node.js + Express v5 + TypeScript.
- Build system: TypeScript compiler (`tsc`) ke output `dist/`.
- API layer:
  - Routing terpusat di `src/routes/*`.
  - Controller sebagai adapter HTTP di `src/controllers/*`.
  - Service layer untuk business logic di `src/services/*`.
- Data layer:
  - ORM Prisma (`src/prisma.ts`) ke SQL Server.
  - Validation contract via Zod schema (`src/schemas/*`).
- Realtime layer: Socket.IO server (`src/ws/*`).
- Caching layer: Redis dengan ioredis (`src/config/redis.ts`, `src/utils/cache.ts`).
- Observability:
  - Error tracking via Sentry (`src/config/sentry.ts`).
  - OpenTelemetry tracing (`src/config/telemetry.ts`).
  - Structured logging via Pino (`src/utils/logger.ts`).
- API documentation: Swagger (`src/config/swagger.ts`).

## 3. Struktur Project (Aktual)

```text
.
├── src/
│   ├── app.ts
│   ├── index.ts
│   ├── prisma.ts
│   ├── config/
│   │   ├── constants.ts
│   │   ├── redis.ts
│   │   ├── sentry.ts
│   │   ├── swagger.ts
│   │   └── telemetry.ts
│   ├── controllers/
│   │   ├── item.controller.ts
│   │   └── logs.controller.ts
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── requestLogger.ts
│   ├── routes/
│   │   ├── health.routes.ts
│   │   ├── item.routes.ts
│   │   └── logs.routes.ts
│   ├── schemas/
│   │   └── item.schema.ts
│   ├── services/
│   │   └── item.service.ts
│   ├── utils/
│   │   ├── cache.ts
│   │   ├── date.ts
│   │   ├── db.ts
│   │   ├── gracefulShutdown.ts
│   │   ├── logger.ts
│   │   └── startupLogger.ts
│   └── ws/
│       ├── connectionHandler.ts
│       ├── poller.ws.ts
│       ├── setup.ts
│       └── ITEMS/
│           └── itemPolling.ws.ts
├── prisma/
│   └── schema.prisma
├── scripts/
│   ├── check-conflict-markers.mjs
│   ├── docs/
│   │   ├── generate-docs.js
│   │   ├── generate-docx.ps1
│   │   └── generate-pdf.ps1
│   └── server/
│       ├── dev-server.cmd
│       ├── dev-server.ps1
│       ├── restart-server.cmd
│       ├── restart-server.ps1
│       ├── start-server.cmd
│       ├── start-server.ps1
│       ├── stop-server.cmd
│       └── stop-server.ps1
├── .github/
│   └── workflows/
│       └── ci.yml
├── .githooks/
│   └── pre-commit
├── build-backend-bundle.js
├── nodemon.json
├── package.json
├── pnpm-lock.yaml
├── README.md
└── tsconfig.json
```

## 4. Mapping Tanggung Jawab Folder

- `src/routes/`: peta endpoint HTTP per domain.
- `src/controllers/`: adapter request/response HTTP.
- `src/services/`: business logic domain.
- `src/schemas/`: validasi payload/request contract.
- `src/middleware/`: cross-cutting concern (error, rate limit, logging).
- `src/config/`: inisialisasi infrastructure integrations.
- `src/utils/`: utility dan helper lintas modul.
- `src/ws/`: websocket orchestration + polling realtime.
- `prisma/`: source of truth schema database.
- `scripts/`: helper automation dev/build/docs/quality.

## 5. Konvensi Coding yang Dipakai

### 5.1 Routing dan Controller

- Satu file route untuk satu scope endpoint.
- Controller menangani mapping HTTP concern, bukan business logic berat.
- Response dan error harus konsisten formatnya.

### 5.2 Service Layer

- Seluruh logic domain ditempatkan di service.
- Service tidak tergantung langsung pada Express request/response object.
- Service wajib reusable untuk HTTP maupun websocket flow.

### 5.3 Validation

- Payload masuk wajib divalidasi lewat Zod.
- Validasi diletakkan di schema layer, bukan ad-hoc di controller.
- Untuk type safety, schema dipakai sebagai contract lintas layer.

### 5.4 Error Handling dan Logging

- Semua error melalui middleware `errorHandler`.
- Logging pakai Pino dengan level yang jelas (info/warn/error/fatal).
- Jangan log secret, credential, token, atau data sensitif.

### 5.5 Realtime dan Polling

- Socket setup terpusat di `src/ws/setup.ts`.
- Event listener wajib punya cleanup untuk hindari memory leak.
- Polling worker harus graceful shutdown saat proses stop.

### 5.6 Observability

- Sentry diinisialisasi sebelum app lifecycle penuh.
- OpenTelemetry di-load paling awal (sebelum import runtime utama lain).
- Tambahkan metadata env/feature flags untuk memudahkan observasi.

## 6. Standar Environment Variables

Contoh baseline variabel yang direkomendasikan:

```env
# Server
PORT=4001
NODE_ENV=development

# Database
DATABASE_URL="sqlserver://localhost:1433;database=mydb;user=sa;password=yourpassword;trustServerCertificate=true"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_ENABLED=false

# Observability
SENTRY_DSN=
SENTRY_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_ENABLED=false
```

Catatan:

- Secret diletakkan di environment host/CI, bukan hardcoded di source.
- Pisahkan env untuk dev/staging/prod agar behavior predictable.

## 7. Workflow Development

### 7.1 Instalasi

```bash
pnpm install
```

### 7.2 Menjalankan Development Server

```bash
pnpm run dev
```

### 7.3 Type Checking

```bash
pnpm run typecheck
```

### 7.4 Build Production

```bash
pnpm run build
pnpm run start
```

### 7.5 Database Workflow

```bash
pnpm run migrate
pnpm run migrate:deploy
pnpm run generate
pnpm run studio
```

## 8. Strategi Testing

- Baseline saat ini: belum ada test runner dedicated di backend.
- Rekomendasi minimum tahap awal:
  - Unit test untuk service dan utility layer.
  - Integration test untuk endpoint kritikal (health + item + logs).
  - Smoke test build/start pada pipeline CI.
- Jika test framework ditambahkan, standar command disarankan:
  - `pnpm run test`
  - `pnpm run test:run`
  - `pnpm run test:coverage`

## 9. Strategi Deploy

- Build artifact wajib dari `pnpm run build`.
- Runtime process dari output `dist/index.js`.
- Deploy minimal membutuhkan:
  - `package.json`
  - `pnpm-lock.yaml`
  - `dist/`
  - `prisma/`
- Jalankan install production dengan lockfile frozen untuk hasil deterministic.
- Gunakan process manager (`systemd`/`pm2`) agar service auto-restart.

## 10. Baseline CI/CD Saat Ini

CI backend (`.github/workflows/ci.yml`) menjalankan:

- `pnpm install --frozen-lockfile`
- `pnpm run check:conflicts:all`
- `pnpm run typecheck`
- `pnpm run build`

Ini menyamakan prinsip FE: pnpm-first, lockfile deterministic, quality gate sebelum build.

## 11. Definition of Done (DoD) Tim

Satu task backend dianggap selesai jika:

- Endpoint/ws flow berjalan sesuai contract.
- Typecheck lulus.
- Build lulus.
- Error handling dan logging sudah diterapkan.
- Tidak ada hardcoded secret/credential di source.
- Perubahan docs/blueprint ikut diupdate bila arsitektur berubah.

## 12. Catatan Audit FE-BE (Standar End-to-End)

Yang sudah disamakan:

- Package manager pin: `pnpm@10.32.1`.
- Install deterministic via `pnpm-lock.yaml` dan `--frozen-lockfile` di CI.
- Guard conflict marker (`check:conflicts`, `check:conflicts:all`).
- Hook installer (`hooks:install`) untuk standar local quality gate.

Perbedaan yang masih wajar (karena karakter project berbeda):

- FE punya test pipeline aktif (Vitest), BE belum punya test runner formal.
- FE build menghasilkan SSR bundle (`build/`), BE build menghasilkan transpiled output (`dist/`).
- FE punya script run-time lint/test yang lebih lengkap karena kebutuhan UI layer.

---

Dokumen ini adalah baseline. Jika arsitektur berubah, update dokumen ini bersamaan dengan perubahan implementasi agar tetap sinkron.
