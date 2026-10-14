# Telemetric — API Observability & Fleet Platform for Cloudflare Workers

A real-time observability, security, and telemetry management platform for Cloudflare Workers APIs.

---

## 🚀 Live Services & Architecture

- **Monitor Server (API & Telemetry Backend)**: `https://apimonitor-server.shakir-ansarii075.workers.dev`
- **Dashboard UI**: Running on `http://localhost:5173/` (Vite + React + Tailwind CSS)
- **Centralized Database**: Cloudflare D1 (`apimonitor-db`, ID: `90f0bf49-0a2c-4460-8b68-99173c14f1a4`)
- **Integrated Workers**:
  1. `vidbunker-resolver` (`https://vidbunker-resolver.shakir-ansarii075.workers.dev`)
  2. `flezen-resolver` (`https://flezen-resolver.shakir-ansarii075.workers.dev`)

---

## 🛠 Features

1. **Non-blocking Asynchronous Telemetry (`ctx.waitUntil`)**:
   - Zero added latency to video streams or extraction calls.
   - Captures status code, latency (ms), client IP, country geo, and endpoints.
2. **Dynamic API Key Management**:
   - Issue keys scoped to `vidbunker`, `flezen`, or `all`.
   - Toggle/revoke or delete keys instantly.
   - Secure SHA-256 storage.
3. **Live Request Inspector**:
   - Filter logs by worker service, HTTP status (200, 401, 500, etc.), IP, or endpoint path.
4. **Analytics Overview**:
   - Request counts (1h, 24h, 7d), success rate %, p95 latency, and worker fleet health.

---

## 📦 Directory Structure

- `frontend/`: React dashboard application.
- `backend/`: Cloudflare Worker handling API telemetry aggregation and key CRUD operations.
- `sdk/monitor.js`: Portable middleware SDK for Cloudflare Workers.
- `schema.sql`: D1 SQL database schema for `api_keys` and `request_logs`.
