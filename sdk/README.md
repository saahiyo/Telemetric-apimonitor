# Telemetric Worker SDK (`sdk/monitor.js`)

Edge-native middleware for Cloudflare Workers providing dynamic API key authentication, rate limiting, and zero-latency asynchronous telemetry logging.

---

## 🚀 Quick Integration

### 1. Copy `monitor.js` to your worker
Copy `sdk/monitor.js` into your Cloudflare Worker source directory (e.g., `src/monitor.js`).

### 2. Bind your D1 database in `wrangler.toml`
```toml
[[d1_databases]]
binding = "DB"
database_name = "apimonitor-db"
database_id = "<YOUR_D1_DATABASE_ID>"
```

### 3. Wrap your fetch handler

```javascript
import { ApiMonitor } from "./monitor.js";

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const monitor = new ApiMonitor("my-service-name", env, ctx);

    // 1. Authenticate request (checks D1 api_keys & rate limits)
    const auth = await monitor.authenticate(request);
    if (!auth.ok) {
      monitor.log(request, auth.status || 401, Date.now() - startTime, null, auth.error);
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status || 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Execute your API logic
    try {
      const result = await handleApiWork(request);
      const response = new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

      // 3. Log telemetry non-blockingly via ctx.waitUntil()
      monitor.log(request, response, Date.now() - startTime, auth.keyData);
      return response;
    } catch (err) {
      monitor.log(request, 500, Date.now() - startTime, auth.keyData, err.message);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
  }
};
```

---

## ⚙️ Features

| Feature | Description |
|---|---|
| **Zero Overhead** | Telemetry logs are dispatched via Cloudflare's `ctx.waitUntil()`. The HTTP response returns to client immediately without waiting for database writes. |
| **Flexible Key Extraction** | Accepts keys via `x-api-key` header, `Authorization: Bearer <key>`, or `?api_key=` / `?key=` query parameters. |
| **Secure Key Hashing** | Uses Web Crypto API SHA-256 — raw secrets are never compared in plaintext in the database. |
| **Per-Minute Rate Limits** | Enforces atomic per-minute quotas with automatic pruning of historical windows. |
| **Local / Static Fallback** | Supports `env.API_KEY` or `env.API_KEYS` comma-separated environment variables for local testing without D1. |
