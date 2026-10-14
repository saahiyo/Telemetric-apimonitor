/**
 * API Monitor SDK Middleware for Cloudflare Workers
 * - Validates API Key against D1 database
 * - Enforces per-minute rate limits (HTTP 429)
 * - Asynchronously logs request/response metadata using ctx.waitUntil()
 */

// Simple SHA-256 helper in Web Crypto API
export async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class ApiMonitor {
  constructor(serviceName, env, ctx) {
    this.service = serviceName;
    this.env = env;
    this.ctx = ctx;
    this.db = env.DB || env.apimonitor_db;
  }

  /**
   * Extract API key from request
   */
  extractApiKey(request) {
    const url = new URL(request.url);
    const headerKey = request.headers.get("x-api-key");
    if (headerKey) return headerKey.trim();

    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.substring(7).trim();
    }

    const queryKey = url.searchParams.get("key") || url.searchParams.get("api_key");
    if (queryKey) return queryKey.trim();

    return null;
  }

  /**
   * Check and enforce rate limit for authenticated key
   */
  async checkRateLimit(keyRecord) {
    if (!this.db || !keyRecord || !keyRecord.rate_limit_per_min) {
      return { limited: false };
    }

    const maxLimit = keyRecord.rate_limit_per_min;
    // Current minute bucket formatted as YYYY-MM-DD HH:MM
    const now = new Date();
    const currentMinute = now.toISOString().substring(0, 16); // e.g. "2026-10-13T21:42"

    try {
      // Upsert request count for this minute bucket
      const updateResult = await this.db
        .prepare(`
          INSERT INTO rate_limits (key_id, window_minute, request_count)
          VALUES (?, ?, 1)
          ON CONFLICT(key_id, window_minute) DO UPDATE SET request_count = request_count + 1
          RETURNING request_count
        `)
        .bind(keyRecord.id, currentMinute)
        .first();

      const currentCount = updateResult?.request_count || 1;

      // Clean old rate limit windows asynchronously
      if (this.ctx && typeof this.ctx.waitUntil === "function") {
        this.ctx.waitUntil(
          this.db
            .prepare("DELETE FROM rate_limits WHERE window_minute < datetime('now', '-10 minutes')")
            .run()
            .catch(() => {})
        );
      }

      if (currentCount > maxLimit) {
        return {
          limited: true,
          limit: maxLimit,
          remaining: 0,
          current: currentCount,
        };
      }

      return {
        limited: false,
        limit: maxLimit,
        remaining: Math.max(0, maxLimit - currentCount),
        current: currentCount,
      };
    } catch (err) {
      console.error("Rate limit check error:", err);
      // Fail-open on rate-limit storage issues to prevent downtime
      return { limited: false };
    }
  }

  /**
   * Validate API key and enforce rate limits
   */
  async authenticate(request) {
    const rawKey = this.extractApiKey(request);
    if (!rawKey) {
      return { ok: false, error: "Missing API key", status: 401 };
    }

    // 1. Check if DB binding exists
    if (this.db) {
      try {
        const keyHash = await sha256(rawKey);
        const record = await this.db
          .prepare(
            `SELECT id, name, key_prefix, service, rate_limit_per_min, is_active, expires_at,
             CASE WHEN expires_at IS NOT NULL AND expires_at < datetime('now') THEN 1 ELSE 0 END as is_expired
             FROM api_keys WHERE key_hash = ? AND is_active = 1`
          )
          .bind(keyHash)
          .first();

        if (record) {
          // Check expiration
          if (record.is_expired === 1) {
            return {
              ok: false,
              error: `API key expired on ${record.expires_at}`,
              status: 403,
              keyData: record,
              rawKey,
            };
          }

          // Check service compatibility
          if (record.service !== "all" && record.service !== this.service) {
            return {
              ok: false,
              error: `API key not authorized for service '${this.service}'`,
              status: 403,
            };
          }

          // Enforce Rate Limit
          const rateCheck = await this.checkRateLimit(record);
          if (rateCheck.limited) {
            return {
              ok: false,
              error: `Too Many Requests: Rate limit of ${rateCheck.limit} req/min exceeded.`,
              status: 429,
              keyData: record,
              rawKey,
            };
          }

          // Update last_used_at asynchronously
          if (this.ctx && typeof this.ctx.waitUntil === "function") {
            this.ctx.waitUntil(
              this.db
                .prepare("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(record.id)
                .run()
                .catch(() => {})
            );
          }

          return { ok: true, keyData: record, rawKey };
        }
      } catch (err) {
        console.error("D1 Auth error, falling back to env var:", err);
      }
    }

    // 2. Fallback to env.API_KEY if defined
    if (this.env.API_KEY && rawKey === this.env.API_KEY) {
      return {
        ok: true,
        keyData: {
          id: `legacy_${this.service}`,
          name: "Legacy Config Key",
          key_prefix: rawKey.substring(0, 10),
          service: this.service,
        },
        rawKey,
      };
    }

    return { ok: false, error: "Invalid or inactive API key", status: 401 };
  }

  /**
   * Log request execution asynchronously without blocking response
   */
  log(request, responseOrStatus, durationMs, keyData = null, errorMessage = null) {
    if (!this.db || !this.ctx || typeof this.ctx.waitUntil !== "function") return;

    const url = new URL(request.url);
    const status = typeof responseOrStatus === "number" ? responseOrStatus : responseOrStatus?.status || 200;
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    const clientCountry = request.cf?.country || "XX";
    const userAgent = (request.headers.get("user-agent") || "").substring(0, 255);
    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const insertPromise = this.db
      .prepare(
        `INSERT INTO request_logs 
        (id, service, endpoint, method, status_code, latency_ms, api_key_id, key_prefix, client_ip, client_country, user_agent, error_message, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(
        id,
        this.service,
        url.pathname,
        request.method,
        status,
        durationMs,
        keyData?.id || null,
        keyData?.key_prefix || (keyData?.rawKey ? keyData.rawKey.substring(0, 10) : null),
        clientIp,
        clientCountry,
        userAgent,
        errorMessage || (status >= 400 ? `HTTP ${status}` : null)
      )
      .run()
      .catch((err) => console.error("Async telemetry log failed:", err));

    this.ctx.waitUntil(insertPromise);
  }
}
