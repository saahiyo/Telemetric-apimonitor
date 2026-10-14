/**
 * apimonitor-server - Management & Query API for Cloudflare Workers Monitor
 * - Protected by ADMIN_KEY (Authorization: Bearer <key> or x-admin-key)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-admin-key",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// SHA-256 helper
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const db = env.DB;
    if (!db) {
      return json({ error: "Database binding missing" }, 500);
    }

    // Health check (Public)
    if (url.pathname === "/api/health") {
      return json({ status: "healthy", timestamp: new Date().toISOString() });
    }

    // ----------------------------------------------------
    // AUTHENTICATION CHECK FOR DASHBOARD API
    // ----------------------------------------------------
    const adminKey = env.ADMIN_KEY || "admin_apimonitor_secret_key";
    
    // Auth login validation endpoint
    if (url.pathname === "/api/auth/verify" && request.method === "POST") {
      try {
        const body = await request.json();
        const provided = body?.passcode || body?.key || "";
        if (provided === adminKey) {
          return json({ success: true, token: adminKey });
        }
        return json({ success: false, error: "Invalid passcode" }, 401);
      } catch {
        return json({ success: false, error: "Bad request" }, 400);
      }
    }

    // Protect all other /api/* endpoints
    const providedAdminKey = 
      request.headers.get("x-admin-key") || 
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("admin_key");

    if (!providedAdminKey || providedAdminKey !== adminKey) {
      return json({ error: "Unauthorized: Dashboard passcode required", status: 401 }, 401);
    }

    // ----------------------------------------------------
    // 1. STATS & ANALYTICS OVERVIEW
    // ----------------------------------------------------
    if (url.pathname === "/api/stats" && request.method === "GET") {
      const timeRange = url.searchParams.get("range") || "24h"; // '1h', '24h', '7d'
      let hours = 24;
      if (timeRange === "1h") hours = 1;
      if (timeRange === "7d") hours = 168;

      try {
        const summary = await db
          .prepare(
            `SELECT 
              COUNT(*) as total_requests,
              SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) as success_requests,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_requests,
              ROUND(AVG(latency_ms), 1) as avg_latency,
              MAX(latency_ms) as max_latency
            FROM request_logs 
            WHERE timestamp >= datetime('now', '-' || ? || ' hours')`
          )
          .bind(hours)
          .first();

        const byService = await db
          .prepare(
            `SELECT 
              service, 
              COUNT(*) as total,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
              ROUND(AVG(latency_ms), 1) as avg_latency
            FROM request_logs
            WHERE timestamp >= datetime('now', '-' || ? || ' hours')
            GROUP BY service`
          )
          .bind(hours)
          .all();

        const byStatus = await db
          .prepare(
            `SELECT 
              status_code, 
              COUNT(*) as count 
            FROM request_logs
            WHERE timestamp >= datetime('now', '-' || ? || ' hours')
            GROUP BY status_code
            ORDER BY count DESC`
          )
          .bind(hours)
          .all();

        const timeline = await db
          .prepare(
            `SELECT 
              strftime('%Y-%m-%d %H:00', timestamp) as hour_bucket,
              service,
              COUNT(*) as requests,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
            FROM request_logs
            WHERE timestamp >= datetime('now', '-' || ? || ' hours')
            GROUP BY hour_bucket, service
            ORDER BY hour_bucket ASC`
          )
          .bind(hours)
          .all();

        return json({
          range: timeRange,
          summary: summary || {
            total_requests: 0,
            success_requests: 0,
            error_requests: 0,
            avg_latency: 0,
            max_latency: 0,
          },
          byService: byService.results || [],
          byStatus: byStatus.results || [],
          timeline: timeline.results || [],
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // 2. REQUEST LOGS (Search & Filter)
    // ----------------------------------------------------
    if (url.pathname === "/api/logs" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
      const service = url.searchParams.get("service");
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      let query = "SELECT * FROM request_logs WHERE 1=1";
      const params = [];

      if (service && service !== "all") {
        query += " AND service = ?";
        params.push(service);
      }
      if (status) {
        if (status === "errors") {
          query += " AND status_code >= 400";
        } else if (status === "success") {
          query += " AND status_code >= 200 AND status_code < 400";
        } else if (!isNaN(parseInt(status, 10))) {
          query += " AND status_code = ?";
          params.push(parseInt(status, 10));
        }
      }
      if (search) {
        query += " AND (endpoint LIKE ? OR client_ip LIKE ? OR key_prefix LIKE ? OR error_message LIKE ?)";
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern);
      }

      query += " ORDER BY timestamp DESC LIMIT ?";
      params.push(limit);

      try {
        let stmt = db.prepare(query);
        if (params.length > 0) {
          stmt = stmt.bind(...params);
        }
        const { results } = await stmt.all();
        return json({ logs: results || [] });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // 3. API KEYS CRUD
    // ----------------------------------------------------
    // GET /api/keys
    if (url.pathname === "/api/keys" && request.method === "GET") {
      try {
        const { results } = await db
          .prepare(
            `SELECT 
              k.id, k.name, k.key_prefix, k.raw_key, k.service, k.rate_limit_per_min, k.is_active,
              k.created_at, k.last_used_at, k.expires_at,
              CASE 
                WHEN k.expires_at IS NOT NULL AND k.expires_at < datetime('now') THEN 1 
                ELSE 0 
              END as is_expired,
              COALESCE(t.total_calls, 0) as total_calls,
              COALESCE(t.calls_1h, 0) as calls_1h,
              COALESCE(t.calls_24h, 0) as calls_24h,
              COALESCE(t.calls_7d, 0) as calls_7d,
              t.success_rate_24h,
              t.avg_latency_24h
            FROM api_keys k
            LEFT JOIN (
              SELECT
                api_key_id,
                COUNT(*) as total_calls,
                SUM(CASE WHEN timestamp >= datetime('now', '-1 hours') THEN 1 ELSE 0 END) as calls_1h,
                SUM(CASE WHEN timestamp >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) as calls_24h,
                SUM(CASE WHEN timestamp >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as calls_7d,
                CASE WHEN SUM(CASE WHEN timestamp >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) > 0
                  THEN ROUND(
                    100.0 * SUM(CASE WHEN timestamp >= datetime('now', '-24 hours')
                                       AND status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END)
                          / SUM(CASE WHEN timestamp >= datetime('now', '-24 hours') THEN 1 ELSE 0 END),
                    1
                  )
                  ELSE NULL
                END as success_rate_24h,
                ROUND(AVG(CASE WHEN timestamp >= datetime('now', '-24 hours') THEN latency_ms END), 1) as avg_latency_24h
              FROM request_logs
              WHERE api_key_id IS NOT NULL
              GROUP BY api_key_id
            ) t ON t.api_key_id = k.id
            ORDER BY k.created_at DESC`
          )
          .all();
        return json({ keys: results || [] });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /api/keys (Create New Key)
    if (url.pathname === "/api/keys" && request.method === "POST") {
      try {
        const body = await request.json();
        const { name, service = "all", rate_limit_per_min = 60, duration_days = null } = body;
        if (!name) return json({ error: "Name is required" }, 400);
        if (String(name).trim().length > 120) {
          return json({ error: "Name must be 120 characters or fewer" }, 400);
        }

        const limit = parseInt(rate_limit_per_min, 10);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
          return json({ error: "rate_limit_per_min must be an integer between 1 and 100000" }, 400);
        }

        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const randomHex = Array.from(randomBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const prefixTag = service === "vidbunker" ? "vb_" : service === "flezen" ? "flz_" : "mon_";
        const secretKey = `${prefixTag}${randomHex}`;
        const keyPrefix = secretKey.substring(0, 10);
        const keyHash = await sha256(secretKey);
        const id = `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        let expiresAt = null;
        if (duration_days && parseInt(duration_days, 10) > 0) {
          const days = parseInt(duration_days, 10);
          if (!Number.isInteger(days) || days > 3650) {
            return json({ error: "duration_days must be 3650 or fewer" }, 400);
          }
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + days);
          expiresAt = expDate.toISOString().replace("T", " ").substring(0, 19);
        }

        await db
          .prepare(
            `INSERT INTO api_keys (id, name, key_prefix, raw_key, key_hash, service, rate_limit_per_min, is_active, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
          )
          .bind(id, String(name).trim(), keyPrefix, secretKey, keyHash, service, limit, expiresAt)
          .run();

        return json(
          {
            success: true,
            message: "API Key created successfully. Store it now as it won't be shown again.",
            key: {
              id,
              name,
              key_prefix: keyPrefix,
              service,
              rate_limit_per_min: limit,
              expires_at: expiresAt,
              secretKey,
            },
          },
          201
        );
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // PUT /api/keys/:id (Edit mutable fields)
    // Only these fields are writable; service scope, hash and prefix stay immutable
    // after creation so an existing key's identity never changes under a client.
    if (url.pathname.startsWith("/api/keys/") && request.method === "PUT") {
      const segments = url.pathname.split("/");
      // /api/keys/:id exactly — /api/keys/:id/toggle is handled below.
      if (segments.length !== 4 || segments[3] === "toggle" || !segments[3]) {
        return json({ error: "Invalid endpoint" }, 404);
      }
      const id = decodeURIComponent(segments[3]);

      try {
        const body = await request.json();
        const updates = [];
        const params = [];

        if (typeof body.name === "string") {
          const name = body.name.trim();
          if (!name) return json({ error: "Name cannot be empty" }, 400);
          if (name.length > 120) return json({ error: "Name must be 120 characters or fewer" }, 400);
          updates.push("name = ?");
          params.push(name);
        }

        if (body.rate_limit_per_min !== undefined) {
          const limit = parseInt(body.rate_limit_per_min, 10);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
            return json({ error: "rate_limit_per_min must be an integer between 1 and 100000" }, 400);
          }
          updates.push("rate_limit_per_min = ?");
          params.push(limit);
        }

        if (body.is_active !== undefined) {
          const active = body.is_active === true || body.is_active === 1 || body.is_active === "1";
          updates.push("is_active = ?");
          params.push(active ? 1 : 0);
        }

        // duration_days is relative to now, matching POST /api/keys.
        // duration_days: null or 0 clears the expiry.
        if (body.duration_days !== undefined) {
          const days = body.duration_days === null ? null : parseInt(body.duration_days, 10);
          if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
            return json({ error: "duration_days must be null or an integer between 1 and 3650" }, 400);
          }
          let expiresAt = null;
          if (days !== null) {
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + days);
            expiresAt = expDate.toISOString().replace("T", " ").substring(0, 19);
          }
          updates.push("expires_at = ?");
          params.push(expiresAt);
        }

        if (updates.length === 0) {
          return json({ error: "No editable fields supplied" }, 400);
        }

        params.push(id);
        const result = await db
          .prepare(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`)
          .bind(...params)
          .run();

        if (!result.meta?.changes) {
          return json({ error: "API key not found" }, 404);
        }

        return json({ success: true, message: "API key updated", id });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // PUT /api/keys/:id/toggle (Activate/Deactivate)
    if (url.pathname.startsWith("/api/keys/") && url.pathname.endsWith("/toggle") && request.method === "PUT") {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      try {
        await db.prepare("UPDATE api_keys SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?").bind(id).run();
        return json({ success: true, message: "Status updated" });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // DELETE /api/keys/:id
    if (url.pathname.startsWith("/api/keys/") && request.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      try {
        await db.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
        // Drop the key's rate-limit buckets so counters never outlive the key.
        await db.prepare("DELETE FROM rate_limits WHERE key_id = ?").bind(id).run();
        return json({ success: true, message: "API key deleted" });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // 4. API TESTING PLAYGROUND PROXY
    // ----------------------------------------------------
    // POST /api/proxy
    if (url.pathname === "/api/proxy" && request.method === "POST") {
      try {
        const body = await request.json();
        const { url: targetUrl, method = "GET", headers = {}, body: reqBody = null } = body;
        if (!targetUrl) return json({ error: "Target URL is required" }, 400);

        const startTime = performance.now();
        const fetchOptions = {
          method,
          headers: { ...headers },
        };
        if (reqBody && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
          fetchOptions.body = typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody);
        }

        const resp = await fetch(targetUrl, fetchOptions);
        const duration = Math.round(performance.now() - startTime);

        const respHeaders = {};
        for (const [k, v] of resp.headers.entries()) {
          respHeaders[k] = v;
        }

        const contentType = resp.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
          try {
            data = await resp.json();
          } catch {
            data = await resp.text();
          }
        } else {
          data = await resp.text();
        }

        return json({
          status: resp.status,
          statusText: resp.statusText,
          duration,
          headers: respHeaders,
          data,
          url: targetUrl,
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: "Endpoint not found" }, 404);
  },
};
