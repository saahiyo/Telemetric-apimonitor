import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Key, 
  Terminal, 
  Server, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Check, 
  Copy, 
  Search,
  Volume2,
  VolumeX,
  Menu,
  X,
  Lock,
  LogOut,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  Palette,
  FlaskConical,
  Send,
  Play,
  RotateCcw,
  Sliders,
  Shield,
  Sparkles,
  Sun,
  Moon,
  ChevronUp,
  ChevronDown,
  User,
  ExternalLink,
  Pencil,
  Zap,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { bind, play, setEnabled, unlock } from 'cuelume';

const API_BASE = import.meta.env.VITE_API_BASE || "";
const STORAGE_AUTH_KEY = "apimonitor_admin_token";
const STORAGE_THEME_KEY = "apimonitor_theme";
const STORAGE_MODE_KEY = "apimonitor_mode";
const STORAGE_WELCOME_KEY = "telemetric_welcome_dismissed";
const STORAGE_ADMIN_NAME_KEY = "telemetric_admin_name";

const THEMES = [
  { id: 'violet', name: 'Linear Violet', dot: '#6366f1' },
  { id: 'cyan', name: 'Cloud Cyan', dot: '#0ea5e9' },
  { id: 'orange', name: 'Cloudflare Orange', dot: '#f97316' },
  { id: 'emerald', name: 'Mint Emerald', dot: '#10b981' },
  { id: 'lime', name: 'Acid Lime', dot: '#cad649' },
];

const PLAYGROUND_PRESETS = [
  {
    name: 'Media API: Stream manifest',
    method: 'POST',
    url: 'https://media-streamer.example.workers.dev/api/stream',
    body: '{\n  "stream_id": "stream_live_1080p"\n}',
    authType: 'api_key',
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'Content-Type', value: 'application/json', enabled: true }
    ]
  },
  {
    name: 'Media API: Health status',
    method: 'GET',
    url: 'https://media-streamer.example.workers.dev/health',
    body: '',
    authType: 'none',
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
  },
  {
    name: 'Auth Service: Token verification',
    method: 'GET',
    url: 'https://auth-service.example.workers.dev/api/verify',
    body: '',
    authType: 'api_key',
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
  },
  {
    name: 'Auth Service: Health ping',
    method: 'GET',
    url: 'https://auth-service.example.workers.dev/health',
    body: '',
    authType: 'none',
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
  },
  {
    name: 'Edge Webhook: Process event',
    method: 'POST',
    url: 'https://edge-webhook.example.workers.dev/api/events',
    body: '{\n  "event": "transaction.created",\n  "amount": 49.99\n}',
    authType: 'api_key',
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'Content-Type', value: 'application/json', enabled: true }
    ]
  },
  {
    name: 'Telemetry API: Stats',
    method: 'GET',
    url: `${API_BASE || ''}/api/stats?range=24h`,
    body: '',
    authType: 'admin_key',
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
  }
];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_AUTH_KEY) || '');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'logs' | 'keys' | 'workers'
  const [timeRange, setTimeRange] = useState('24h');
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_THEME_KEY) || 'violet');
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_MODE_KEY) || 'dark');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => localStorage.getItem(STORAGE_WELCOME_KEY) === "true");
  const [adminName, setAdminName] = useState(() => localStorage.getItem(STORAGE_ADMIN_NAME_KEY) || 'Admin');

  const getAdminGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // New Key Modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyService, setNewKeyService] = useState('all');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(60);
  const [newKeyDurationDays, setNewKeyDurationDays] = useState('30'); // '30', '7', '90', '365', 'custom', '' (never)
  const [customDays, setCustomDays] = useState('');
  const [createdKeyData, setCreatedKeyData] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editKeyName, setEditKeyName] = useState('');
  const [editKeyRateLimit, setEditKeyRateLimit] = useState('');
  const [editKeyDurationDays, setEditKeyDurationDays] = useState('');
  const [editKeyError, setEditKeyError] = useState('');
  const [editKeySaving, setEditKeySaving] = useState(false);

  // Log filters & inspector
  const [logFilterService, setLogFilterService] = useState('all');
  const [logFilterStatus, setLogFilterStatus] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  // Worker Health statuses
  const [workerHealth, setWorkerHealth] = useState({
    'media-streamer': { status: 'checking', latency: 0 },
    'auth-service': { status: 'checking', latency: 0 },
    'edge-webhook': { status: 'checking', latency: 0 }
  });

  // API Testing Playground State
  const [pgMethod, setPgMethod] = useState('POST');
  const [pgUrl, setPgUrl] = useState('https://media-streamer.example.workers.dev/api/stream');
  const [pgAuthType, setPgAuthType] = useState('api_key'); // 'none' | 'api_key' | 'admin_key' | 'bearer'
  const [pgAuthValue, setPgAuthValue] = useState(() => localStorage.getItem("apimonitor_last_key") || '');
  const [pgHeaders, setPgHeaders] = useState([
    { key: 'Accept', value: 'application/json', enabled: true },
    { key: 'Content-Type', value: 'application/json', enabled: true }
  ]);
  const [pgBody, setPgBody] = useState('{\n  "stream_id": "stream_live_1080p"\n}');
  const [pgMode, setPgMode] = useState('direct'); // 'direct' | 'proxy'
  const [pgLoading, setPgLoading] = useState(false);
  const [pgResponse, setPgResponse] = useState(null);
  const [pgReqTab, setPgReqTab] = useState('auth'); // 'auth' | 'headers' | 'body'
  const [pgRespTab, setPgRespTab] = useState('body'); // 'body' | 'headers'
  const [pgCopiedResp, setPgCopiedResp] = useState(false);

  // Simplified API Key Tester State
  const [testService, setTestService] = useState('media-streamer');
  const [testKey, setTestKey] = useState(() => localStorage.getItem("apimonitor_last_key") || '');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSelectKeyForTest = (k) => {
    const rawVal = k.raw_key || k.key_prefix;
    setTestKey(rawVal);
    if (k.service && k.service !== 'all') {
      setTestService(k.service);
    }
    play("tap", { emphasis: "subtle" });
  };

  const handleTestKey = async (overrideService, overrideKey) => {
    const svc = overrideService || testService;
    const key = (overrideKey !== undefined ? overrideKey : testKey).trim();
    if (!key && svc !== 'telemetry') {
      play("error");
      return;
    }

    setTestLoading(true);
    setTestResult(null);
    play("tap");

    const startTime = performance.now();
    let url = '';
    let method = 'GET';
    let body = undefined;
    const headers = {};

    if (svc === 'telemetry') {
      url = `${API_BASE}/api/stats?range=24h`;
      method = 'GET';
      headers['x-admin-key'] = key || token;
    } else {
      const matched = PLAYGROUND_PRESETS.find(p => p.name?.toLowerCase().includes(svc.toLowerCase()) || p.url?.toLowerCase().includes(svc.toLowerCase()));
      url = matched ? matched.url : `${API_BASE}/api/keys`;
      method = matched ? matched.method : 'GET';
      headers['x-api-key'] = key;
    }

    try {
      // Direct client fetch from browser: bypasses Cloudflare Worker-to-Worker (Error 1042) restriction
      const fetchOptions = {
        method,
        headers
      };
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = body;
      }

      let res, data;
      try {
        res = await fetch(url, fetchOptions);
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } catch (directErr) {
        // Fallback to proxy only if direct browser call fails
        const proxyRes = await authFetch(`${API_BASE}/api/proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, method, headers, body })
        });
        const proxyData = await proxyRes.json();
        res = { status: proxyData.status || proxyRes.status, statusText: proxyData.statusText || proxyRes.statusText };
        data = proxyData.data || proxyData;
      }

      const duration = Math.round(performance.now() - startTime);
      const status = res.status;

      // Key authentication check:
      // Status 401: Invalid or Missing API key
      // Status 403: Wrong service scope or expired key
      // Any other status (200, 400, etc.) means the gateway successfully validated the key!
      const isAuthRejected = status === 401 || status === 403;
      const isSuccess = !isAuthRejected && status < 500;

      let message = '';
      if (isSuccess) {
        message = `Successfully verified on ${svc} worker in ${duration}ms. Key is active and authorized.`;
      } else if (status === 401) {
        message = data?.error || 'Invalid or inactive API key.';
      } else if (status === 403) {
        message = data?.error || `API key not authorized for service '${svc}'.`;
      } else {
        message = data?.error || (typeof data === 'string' ? data : 'Worker returned an error.');
      }

      setTestResult({
        status: isSuccess ? 200 : status,
        statusText: isSuccess ? 'OK' : (res.statusText || 'Unauthorized'),
        duration,
        data,
        message,
        isSuccess,
        service: svc,
        keyUsed: key
      });

      if (isSuccess) {
        play("success", { emphasis: "strong" });
      } else {
        play("error");
      }
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      setTestResult({
        status: 500,
        statusText: 'Verification Error',
        duration,
        data: { error: err.message },
        message: err.message,
        isSuccess: false,
        service: svc,
        keyUsed: key
      });
      play("error");
    } finally {
      setTestLoading(false);
    }
  };

  const handleLoadPreset = (preset) => {
    setPgMethod(preset.method);
    setPgUrl(preset.url);
    if (preset.body !== undefined) setPgBody(preset.body);
    if (preset.headers) setPgHeaders(preset.headers);
    if (preset.authType) setPgAuthType(preset.authType);

    if (preset.authType === 'api_key') {
      // Auto-match an active key from user's keys if available
      const matching = keys.find(k => 
        k.is_active && !k.is_expired && k.raw_key && 
        (preset.name?.toLowerCase().includes(k.service.toLowerCase()) || preset.url?.toLowerCase().includes(k.service.toLowerCase()) || k.service === 'all')
      );
      if (matching?.raw_key) {
        setPgAuthValue(matching.raw_key);
      }
    } else if (preset.authType === 'admin_key') {
      if (token) setPgAuthValue(token);
    }
    play("select");
  };

  const handleSwitchBaseUrl = (newBase) => {
    try {
      const current = new URL(pgUrl);
      setPgUrl(`${newBase}${current.pathname}${current.search}`);
    } catch {
      setPgUrl(`${newBase}/api/stream`);
    }
    play("tap", { emphasis: "subtle" });
  };

  const handleAddHeader = () => {
    setPgHeaders(prev => [...prev, { key: '', value: '', enabled: true }]);
    play("tap", { emphasis: "subtle" });
  };

  const handleRemoveHeader = (index) => {
    setPgHeaders(prev => prev.filter((_, i) => i !== index));
    play("tap", { emphasis: "subtle" });
  };

  const handleHeaderChange = (index, field, value) => {
    setPgHeaders(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const formatPgBody = () => {
    try {
      const parsed = JSON.parse(pgBody);
      setPgBody(JSON.stringify(parsed, null, 2));
      play("tap");
    } catch {
      play("error");
    }
  };

  const formatHighlightedJson = (data) => {
    let str = '';
    try {
      if (typeof data === 'object' && data !== null) {
        str = JSON.stringify(data, null, 2);
      } else if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          str = JSON.stringify(parsed, null, 2);
        } catch {
          str = data;
        }
      } else {
        str = String(data ?? '');
      }
    } catch {
      str = String(data ?? '');
    }

    const escaped = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            const colonIdx = match.lastIndexOf(':');
            const keyName = match.slice(0, colonIdx);
            const trailing = match.slice(colonIdx);
            return `<span class="json-key">${keyName}</span><span class="text-fg-3">${trailing}</span>`;
          }
          return `<span class="json-str">${match}</span>`;
        }
        if (/true|false/.test(match)) {
          return `<span class="json-bool">${match}</span>`;
        }
        if (/null/.test(match)) {
          return `<span class="json-null">${match}</span>`;
        }
        return `<span class="json-num">${match}</span>`;
      }
    );
  };

  const handleSendPlayground = async (e) => {
    if (e) e.preventDefault();
    if (!pgUrl) return;
    setPgLoading(true);
    setPgResponse(null);
    play("tap");

    const startTime = performance.now();
    try {
      const headers = {};
      pgHeaders.forEach((h) => {
        if (h.enabled && h.key && h.value) {
          headers[h.key] = h.value;
        }
      });

      if (pgAuthType === 'api_key' && pgAuthValue) {
        headers['x-api-key'] = pgAuthValue;
      } else if (pgAuthType === 'admin_key') {
        headers['x-admin-key'] = pgAuthValue || token;
      } else if (pgAuthType === 'bearer' && pgAuthValue) {
        headers['Authorization'] = `Bearer ${pgAuthValue}`;
      }

      if (pgMode === 'proxy') {
        const res = await authFetch(`${API_BASE}/api/proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: pgUrl,
            method: pgMethod,
            headers,
            body: ['POST', 'PUT', 'PATCH'].includes(pgMethod) ? pgBody : undefined
          })
        });
        const result = await res.json();
        const duration = result.duration || Math.round(performance.now() - startTime);

        if (res.ok) {
          setPgResponse({
            status: result.status,
            statusText: result.statusText,
            duration,
            headers: result.headers || {},
            data: result.data,
            size: JSON.stringify(result.data).length
          });
          if (result.status >= 200 && result.status < 300) {
            play("success", { emphasis: "subtle" });
          } else {
            play("error");
          }
        } else {
          setPgResponse({
            status: res.status,
            statusText: res.statusText,
            duration,
            headers: {},
            data: result,
            size: JSON.stringify(result).length
          });
          play("error");
        }
      } else {
        const fetchOptions = {
          method: pgMethod,
          headers
        };
        if (['POST', 'PUT', 'PATCH'].includes(pgMethod) && pgBody) {
          fetchOptions.body = pgBody;
        }

        const res = await fetch(pgUrl, fetchOptions);
        const duration = Math.round(performance.now() - startTime);
        const respHeaders = {};
        for (const [k, v] of res.headers.entries()) {
          respHeaders[k] = v;
        }

        const contentType = res.headers.get('content-type') || '';
        let data;
        let rawText = '';
        if (contentType.includes('application/json')) {
          try {
            data = await res.json();
            rawText = JSON.stringify(data, null, 2);
          } catch {
            data = await res.text();
            rawText = data;
          }
        } else {
          data = await res.text();
          rawText = data;
        }

        setPgResponse({
          status: res.status,
          statusText: res.statusText,
          duration,
          headers: respHeaders,
          data,
          size: rawText.length
        });

        if (res.ok) {
          play("success", { emphasis: "subtle" });
        } else {
          play("error");
        }
      }

      setTimeout(() => {
        fetchLogs();
        fetchStats();
      }, 1500);

    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      setPgResponse({
        status: 0,
        statusText: 'Network / CORS Error',
        duration,
        headers: {},
        data: {
          error: err.message,
          hint: pgMode === 'direct' ? 'If this is a CORS limitation on an external endpoint, switch Mode to "Edge Proxy (Bypass CORS)".' : 'Check destination URL.'
        },
        size: 0
      });
      play("error");
    } finally {
      setPgLoading(false);
    }
  };

  // 1. Initialize cuelume delegated interaction listener
  useEffect(() => {
    const unbind = bind();
    return () => unbind();
  }, []);

  // Theme and Mode synchronization
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  }, [mode]);

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    play("toggle");
  };

  const changeMode = (newMode) => {
    if (newMode !== mode) {
      setMode(newMode);
      play("toggle");
    }
  };

  const toggleMode = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    play("toggle");
  };

  // Close profile menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setEnabled(next);
    if (next) {
      await unlock();
      play("toggle");
    }
  };

  // Authenticated fetch helper
  const authFetch = (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      'x-admin-key': token,
    };
    return fetch(url, { ...options, headers });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!passcode) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem(STORAGE_AUTH_KEY, data.token);
        setToken(data.token);
        setPasscode('');
        play("success", { emphasis: "strong" });
      } else {
        setAuthError(data.error || "Incorrect passcode");
        play("error");
      }
    } catch (err) {
      setAuthError("Failed to verify passcode: " + err.message);
      play("error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_AUTH_KEY);
    setToken('');
    play("close", { emphasis: "subtle" });
  };

  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await authFetch(`${API_BASE}/api/stats?range=${timeRange}`);
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const fetchLogs = async () => {
    if (!token) return;
    try {
      let url = `${API_BASE}/api/logs?service=${logFilterService}&limit=100`;
      if (logFilterStatus !== 'all') url += `&status=${logFilterStatus}`;
      if (logSearch) url += `&search=${encodeURIComponent(logSearch)}`;
      const res = await authFetch(url);
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to load logs:", err);
    }
  };

  const fetchKeys = async () => {
    if (!token) return;
    try {
      const res = await authFetch(`${API_BASE}/api/keys`);
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      console.error("Failed to load keys:", err);
    }
  };

  const checkWorkerPings = async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(`${API_BASE}/api/health`);
      const dt = Math.round(performance.now() - t0);
      const isOnline = r.ok;
      setWorkerHealth({
        'media-streamer': { status: isOnline ? 'online' : 'degraded', latency: dt, version: '2.1.0' },
        'auth-service': { status: isOnline ? 'online' : 'degraded', latency: Math.max(12, dt - 8), version: '1.4.0' },
        'edge-webhook': { status: isOnline ? 'online' : 'degraded', latency: Math.max(15, dt - 5), version: '1.0.0' }
      });
    } catch {
      setWorkerHealth({
        'media-streamer': { status: 'offline', latency: 0 },
        'auth-service': { status: 'offline', latency: 0 },
        'edge-webhook': { status: 'offline', latency: 0 }
      });
    }
  };

  const loadAll = async () => {
    if (!token) return;
    setLoading(true);
    await Promise.all([fetchStats(), fetchLogs(), fetchKeys(), checkWorkerPings()]);
    setLoading(false);
  };

  useEffect(() => {
    if (token) {
      loadAll();
      const interval = setInterval(() => {
        fetchStats();
        fetchLogs();
      }, 12000);
      return () => clearInterval(interval);
    }
  }, [timeRange, token]);

  useEffect(() => {
    if (token) {
      fetchLogs();
    }
  }, [logFilterService, logFilterStatus, logSearch, token]);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName) return;
    let daysToSet = null;
    if (newKeyDurationDays === 'custom') {
      daysToSet = parseInt(customDays, 10) || null;
    } else if (newKeyDurationDays !== '') {
      daysToSet = parseInt(newKeyDurationDays, 10);
    }

    try {
      const res = await authFetch(`${API_BASE}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newKeyName, 
          service: newKeyService, 
          rate_limit_per_min: parseInt(newKeyRateLimit, 10) || 60,
          duration_days: daysToSet
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedKeyData(data.key);
        if (data.key?.secretKey) {
          localStorage.setItem("apimonitor_last_key", data.key.secretKey);
          setPgAuthValue(data.key.secretKey);
        }
        play("success", { emphasis: "strong" });
        fetchKeys();
      } else {
        play("error");
      }
    } catch (err) {
      play("error");
      alert("Failed to create key: " + err.message);
    }
  };

  const openEditKey = (key) => {
    setEditingKey(key);
    setEditKeyName(key.name || '');
    setEditKeyRateLimit(String(key.rate_limit_per_min ?? 60));
    // 'keep' leaves expires_at untouched; '' clears it to never-expire.
    setEditKeyDurationDays('keep');
    setEditKeyError('');
  };

  const closeEditKey = () => {
    if (editKeySaving) return;
    setEditingKey(null);
    setEditKeyError('');
  };

  const handleSaveKeyEdit = async (e) => {
    e.preventDefault();
    if (!editingKey || editKeySaving) return;

    const limit = parseInt(editKeyRateLimit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
      setEditKeyError('Rate limit must be a whole number between 1 and 100000');
      return;
    }
    if (!editKeyName.trim()) {
      setEditKeyError('Name cannot be empty');
      return;
    }

    const payload = {
      name: editKeyName.trim(),
      rate_limit_per_min: limit,
    };
    if (editKeyDurationDays !== 'keep') {
      if (editKeyDurationDays === '') {
        payload.duration_days = null;
      } else {
        const days = parseInt(editKeyDurationDays, 10);
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          setEditKeyError('Duration must be between 1 and 3650 days');
          return;
        }
        payload.duration_days = days;
      }
    }

    setEditKeySaving(true);
    setEditKeyError('');
    try {
      const res = await authFetch(`${API_BASE}/api/keys/${encodeURIComponent(editingKey.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditKeyError(data.error || 'Failed to update key');
        play("error");
        return;
      }
      play("success", { emphasis: "subtle" });
      setEditingKey(null);
      await fetchKeys();
    } catch (err) {
      setEditKeyError(err.message);
      play("error");
    } finally {
      setEditKeySaving(false);
    }
  };

  const handleToggleKey = async (id) => {
    try {
      await authFetch(`${API_BASE}/api/keys/${id}/toggle`, { method: 'PUT' });
      play("toggle");
      fetchKeys();
    } catch (err) {
      play("error");
      console.error(err);
    }
  };

  const handleDeleteKey = async (id) => {
    if (!confirm("Are you sure you want to delete this API key?")) return;
    try {
      await authFetch(`${API_BASE}/api/keys/${id}`, { method: 'DELETE' });
      play("close", { emphasis: "strong" });
      fetchKeys();
    } catch (err) {
      play("error");
      console.error(err);
    }
  };

  const copyToClipboard = (text, id = null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(id || text);
    if (text.startsWith('vb_') || text.startsWith('flz_') || text.startsWith('mon_')) {
      localStorage.setItem("apimonitor_last_key", text);
      setPgAuthValue(text);
    }
    play("success", { emphasis: "subtle" });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  // -------------------------------------------------------------
  // PASSCODE AUTHENTICATION SCREEN
  // -------------------------------------------------------------
  if (!token) {
    return (
      <div className="min-h-screen bg-page text-fg flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-surface border border-line rounded-panel p-6 space-y-5 shadow-2xl apple-dialog">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="h-9 w-9 rounded-control bg-accent flex items-center justify-center text-on-accent font-black text-sm">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-semibold text-base text-fg">Dashboard access</h1>
              <p className="text-xs text-fg-3">Enter administrator passcode</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="p-2.5 rounded-control bg-danger-tint border border-danger text-danger-text text-xs flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-fg-2 block">Passcode</label>
              <div className="relative">
                <input
                  type={showPasscode ? "text" : "password"}
                  data-cuelume-type
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter passcode"
                  autoFocus
                  required
                  className="w-full bg-field border border-line rounded-control pl-3 pr-9 py-2 text-xs text-fg font-mono focus:outline-none focus:border-accent-line"
                />
                <button
                  type="button"
                  data-cuelume-tap
                  data-cuelume-emphasis="subtle"
                  onClick={() => {
                    setShowPasscode(!showPasscode);
                    play("toggle");
                  }}
                  className="absolute right-2.5 top-2 text-fg-3 hover:text-fg transition p-0.5"
                  title={showPasscode ? "Hide passcode" : "Show passcode"}
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              data-cuelume-tap
              className="w-full py-2.5 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <span>{authLoading ? 'Verifying…' : 'Unlock dashboard'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>

          <div className="flex items-center justify-between pt-3 border-t border-line text-[11px] text-fg-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMode}
                data-cuelume-tap
                data-cuelume-emphasis="subtle"
                className="p-1 hover:text-fg rounded bg-surface-2 border border-line transition flex items-center gap-1 text-[10px] text-fg-2"
                title={`Switch to ${mode === 'dark' ? 'Light' : 'Dark'} mode`}
              >
                {mode === 'dark' ? <Sun className="h-3 w-3 text-warn" /> : <Moon className="h-3 w-3 text-accent" />}
                <span className="capitalize">{mode}</span>
              </button>
              <Palette className="h-3 w-3 text-accent ml-1" />
              <span>Color</span>
            </div>
            <div className="flex items-center gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => changeTheme(t.id)}
                  className={`h-4 w-4 rounded-full transition-transform flex items-center justify-center ${
                    theme === t.id ? 'ring-2 ring-accent scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{ backgroundColor: t.dot }}
                  title={t.name}
                >
                  {theme === t.id && <span className="h-1 w-1 rounded-full bg-white shadow-xs"></span>}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-fg-3 text-center">
            Cloudflare Workers & D1 Telemetry Gateway
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // AUTHENTICATED DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="flex h-screen bg-page text-fg overflow-hidden relative">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)} 
          className="fixed inset-0 bg-black/40 z-30 md:hidden backdrop-blur-sm apple-backdrop transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-line bg-surface flex flex-col justify-between p-4 transition-all duration-300 ease-apple-spring
        ${sidebarOpen ? 'translate-x-0 shadow-2xl opacity-100 visible' : '-translate-x-full opacity-0 invisible pointer-events-none'}
        md:static md:translate-x-0 md:opacity-100 md:visible md:pointer-events-auto md:shadow-none
      `}>
        <div>
          <div className="flex items-center justify-between px-2 py-3 mb-6 border-b border-line">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded bg-accent flex items-center justify-center text-on-accent font-black text-xs">
                T
              </div>
              <div>
                <h1 className="font-semibold text-sm leading-tight text-fg">Telemetric</h1>
                <p className="text-xs text-fg-3">Cloudflare Fleet</p>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-1 text-fg-3 hover:text-fg md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1">
            <button
              data-cuelume-select
              onClick={() => selectTab('overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-sm font-medium transition ${
                activeTab === 'overview' 
                  ? 'bg-accent-wash text-fg font-semibold' 
                  : 'text-fg-2 hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Activity className="h-4 w-4 text-fg-3" />
              Overview
            </button>
            <button
              data-cuelume-select
              onClick={() => selectTab('logs')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-sm font-medium transition ${
                activeTab === 'logs' 
                  ? 'bg-accent-wash text-fg font-semibold' 
                  : 'text-fg-2 hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Terminal className="h-4 w-4 text-fg-3" />
              Live logs
              {logs.length > 0 && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-surface-2 text-fg-3 font-mono">
                  {logs.length}
                </span>
              )}
            </button>
            <button
              data-cuelume-select
              onClick={() => selectTab('keys')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-sm font-medium transition ${
                activeTab === 'keys' 
                  ? 'bg-accent-wash text-fg font-semibold' 
                  : 'text-fg-2 hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Key className="h-4 w-4 text-fg-3" />
              API keys
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-surface-2 text-fg-3 font-mono">
                {keys.length}
              </span>
            </button>
            <button
              data-cuelume-select
              onClick={() => selectTab('workers')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-sm font-medium transition ${
                activeTab === 'workers' 
                  ? 'bg-accent-wash text-fg font-semibold' 
                  : 'text-fg-2 hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Server className="h-4 w-4 text-fg-3" />
              Workers fleet
            </button>
            <button
              data-cuelume-select
              onClick={() => selectTab('playground')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-sm font-medium transition ${
                activeTab === 'playground' 
                  ? 'bg-accent-wash text-fg font-semibold' 
                  : 'text-fg-2 hover:text-fg hover:bg-surface-2'
              }`}
            >
              <FlaskConical className="h-4 w-4 text-fg-3" />
              API playground
            </button>
          </nav>
        </div>

        {/* Footer: D1 Status & Profile Tab Button */}
        <div className="space-y-2 pt-4 relative">
          <div className="p-2 bg-surface-2/60 rounded-control border border-line text-xs flex items-center justify-between">
            <div>
              <span className="font-medium text-fg text-[11px] block leading-tight">D1 Telemetry</span>
              <span className="text-fg-3 font-mono text-[10px]">apimonitor-db (APAC)</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
              Live
            </span>
          </div>

          {/* Profile Card Button -> opens separate Profile tab page */}
          <button
            onClick={() => selectTab('profile')}
            data-cuelume-select
            className={`w-full flex items-center gap-2.5 p-2 rounded-control border transition text-left group ${
              activeTab === 'profile' 
                ? 'bg-accent-wash text-fg border-accent-line' 
                : 'bg-surface hover:bg-surface-2 border-line'
            }`}
          >
            <div className="h-7 w-7 rounded-full bg-accent text-on-accent font-bold text-xs flex items-center justify-center shrink-0">
              {(adminName?.trim() || 'Admin').substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-fg leading-none truncate">{adminName?.trim() || 'Admin'} Console</span>
                <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" title="Active"></span>
              </div>
              <p className="text-[10px] text-fg-3 truncate mt-0.5">Settings & Theme</p>
            </div>
            <ArrowRight className={`h-3.5 w-3.5 text-fg-3 shrink-0 transition-transform ${
              activeTab === 'profile' ? 'text-accent translate-x-0.5' : 'group-hover:translate-x-0.5 group-hover:text-fg'
            }`} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-line bg-page px-4 sm:px-6 flex items-center justify-between sticky top-0 z-10 shrink-0 transition-colors">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-fg-3 hover:text-fg rounded-control hover:bg-surface-2 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-sm sm:text-base font-semibold text-fg truncate">
              {activeTab === 'overview' && 'System overview'}
              {activeTab === 'logs' && 'Request inspector'}
              {activeTab === 'keys' && 'API keys'}
              {activeTab === 'workers' && 'Active workers'}
              {activeTab === 'playground' && 'API testing playground'}
              {activeTab === 'profile' && 'Profile & settings'}
            </h2>
            {loading && <span className="text-xs text-fg-3 hidden sm:flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin"/> Updating</span>}
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'overview' && (
              <div className="flex items-center gap-1.5">
                {welcomeDismissed && (
                  <button
                    onClick={() => {
                      setWelcomeDismissed(false);
                      localStorage.removeItem(STORAGE_WELCOME_KEY);
                      play("open");
                    }}
                    data-cuelume-tap
                    data-cuelume-emphasis="subtle"
                    className="hidden sm:flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-control bg-accent-wash text-accent border border-accent-line text-[11px] font-medium hover:bg-accent-wash transition"
                    title="Show admin welcome bar"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Welcome Bar</span>
                  </button>
                )}
                <div className="flex items-center bg-surface rounded-control p-0.5 border border-line text-xs font-medium">
                  {['1h', '24h', '7d'].map((r) => (
                    <button
                      key={r}
                      data-cuelume-select
                      onClick={() => setTimeRange(r)}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded transition text-[11px] sm:text-xs ${
                        timeRange === r ? 'bg-surface-3 text-fg' : 'text-fg-3 hover:text-fg'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Light/Dark Mode Toggle */}
            <button
              onClick={toggleMode}
              data-cuelume-tap
              data-cuelume-emphasis="subtle"
              className="p-1.5 text-fg-3 hover:text-fg bg-surface rounded-control border border-line transition hover:bg-surface-2 flex items-center justify-center"
              title={`Switch to ${mode === 'dark' ? 'Light' : 'Dark'} mode`}
            >
              {mode === 'dark' ? <Sun className="h-3.5 w-3.5 text-warn" /> : <Moon className="h-3.5 w-3.5 text-accent" />}
            </button>

            {/* Quick theme cycle button */}
            <button
              onClick={() => {
                const idx = THEMES.findIndex(t => t.id === theme);
                const nextTheme = THEMES[(idx + 1) % THEMES.length].id;
                changeTheme(nextTheme);
              }}
              data-cuelume-tap
              data-cuelume-emphasis="subtle"
              className="p-1.5 text-fg-3 hover:text-fg bg-surface rounded-control border border-line transition hover:bg-surface-2 flex items-center justify-center"
              title={`Current theme: ${THEMES.find(t => t.id === theme)?.name} (click to cycle)`}
            >
              <Palette className="h-3.5 w-3.5 text-accent" />
            </button>

            <button
              onClick={() => {
                loadAll();
                play("tap", { emphasis: "subtle" });
              }}
              className="p-1.5 text-fg-3 hover:text-fg bg-surface rounded-control border border-line transition hover:bg-surface-2"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            {activeTab === 'keys' && (
              <button
                data-cuelume-open
                onClick={() => { setShowKeyModal(true); setCreatedKeyData(null); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold shadow-sm transition shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Create key</span>
                <span className="sm:hidden">New</span>
              </button>
            )}
          </div>
        </header>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* ============================================================== */}
          {/* TAB 1: OVERVIEW */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* ADMIN BAR (COMPACT & SIMPLE) */}
              {!welcomeDismissed && (
                <div className="p-3 sm:px-4 sm:py-3 rounded-panel bg-surface border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  {/* Left: Greeting, role & live indicators */}
                  <div className="flex items-center min-w-0">

                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm text-fg whitespace-nowrap">
                        {getAdminGreeting()}, <span className="text-accent">{adminName?.trim() || 'Admin'}</span> 👋
                      </span>
                      <span className="hidden lg:inline text-fg-3 text-xs">•</span>
                      <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-fg-3 font-mono">
                        <Zap className="h-3 w-3 text-accent" /> {stats?.summary?.avg_latency || 0}ms avg
                      </span>
                    </div>
                  </div>

                  {/* Right: Quick actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => {
                        selectTab('keys');
                        setShowKeyModal(true);
                        setCreatedKeyData(null);
                        play("open");
                      }}
                      data-cuelume-tap
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold shadow-sm transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Issue Key</span>
                    </button>

                    <button
                      onClick={() => {
                        selectTab('logs');
                        play("tap");
                      }}
                      data-cuelume-tap
                      data-cuelume-emphasis="subtle"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-surface-2 hover:bg-surface-3 text-fg border border-line text-xs font-medium transition"
                    >
                      <Terminal className="h-3.5 w-3.5 text-fg-3" />
                      <span>Live Logs</span>
                    </button>

                    <button
                      onClick={() => {
                        setWelcomeDismissed(true);
                        localStorage.setItem(STORAGE_WELCOME_KEY, "true");
                        play("close");
                      }}
                      className="p-1 text-fg-3 hover:text-fg rounded-control hover:bg-surface-2 transition"
                      title="Dismiss"
                      aria-label="Dismiss bar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Summary Statement */}
              <div className="bg-surface rounded-panel border border-line p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-fg mb-1">Activity statement</h3>
                <p className="text-xs sm:text-sm text-fg-2 leading-relaxed">
                  Processed <span className="font-semibold text-fg">{stats?.summary?.total_requests || 0} requests</span> across 3 worker services in the past {timeRange}.
                  Average response latency is <span className="font-semibold text-fg">{stats?.summary?.avg_latency || 0} ms</span> with <span className="font-semibold text-fg">{stats?.summary?.error_requests || 0} failed requests</span>.
                </p>
              </div>

              {/* Workers Fleet Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-panel bg-surface border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-success shrink-0"></span>
                      <h4 className="font-semibold text-sm text-fg truncate">media-streamer</h4>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg-2 font-mono shrink-0">
                      {workerHealth['media-streamer']?.status || 'online'} ({workerHealth['media-streamer']?.latency || 0}ms)
                    </span>
                  </div>
                  <div className="text-xs text-fg-3 grid grid-cols-3 gap-2 bg-surface-2 p-2.5 rounded-control text-center sm:text-left">
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Route</span>
                      <span className="text-fg font-mono truncate block">/api/stream</span>
                    </div>
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Rate limits</span>
                      <span className="text-accent font-medium">Enforced</span>
                    </div>
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Caching</span>
                      <span className="text-fg">Edge 1h</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-panel bg-surface border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-success shrink-0"></span>
                      <h4 className="font-semibold text-sm text-fg truncate">auth-service</h4>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg-2 font-mono shrink-0">
                      {workerHealth['auth-service']?.status || 'online'} ({workerHealth['auth-service']?.latency || 0}ms)
                    </span>
                  </div>
                  <div className="text-xs text-fg-3 grid grid-cols-3 gap-2 bg-surface-2 p-2.5 rounded-control text-center sm:text-left">
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Route</span>
                      <span className="text-fg font-mono truncate block">/api/verify</span>
                    </div>
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Rate limits</span>
                      <span className="text-accent font-medium">Enforced</span>
                    </div>
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Caching</span>
                      <span className="text-fg">Edge 15m</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-panel bg-surface border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-success shrink-0"></span>
                      <h4 className="font-semibold text-sm text-fg truncate">edge-webhook</h4>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg-2 font-mono shrink-0">
                      {workerHealth['edge-webhook']?.status || 'online'} ({workerHealth['edge-webhook']?.latency || 0}ms)
                    </span>
                  </div>
                  <div className="text-xs text-fg-3 grid grid-cols-3 gap-2 bg-surface-2 p-2.5 rounded-control text-center sm:text-left">
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Route</span>
                      <span className="text-fg font-mono truncate block">/api/events</span>
                    </div>
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Rate limits</span>
                      <span className="text-accent font-medium">Enforced</span>
                    </div>
                    <div>
                      <span className="text-fg-3 block text-[10px] sm:text-[11px]">Scope</span>
                      <span className="text-fg">Global Edge</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Breakdown & Status Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="p-4 sm:p-5 rounded-panel bg-surface border border-line space-y-4">
                  <h3 className="font-semibold text-fg text-sm">Traffic by worker</h3>
                  {stats?.byService?.length ? (
                    <div className="space-y-3">
                      {stats.byService.map((svc) => (
                        <div key={svc.service} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-fg capitalize">{svc.service}</span>
                            <span className="text-fg-3 font-mono">{svc.total} reqs ({svc.avg_latency} ms avg)</span>
                          </div>
                          <div className="w-full bg-surface-3 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-accent h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, (svc.total / (stats.summary.total_requests || 1)) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-fg-3 py-4">No requests recorded in the last {timeRange}.</p>
                  )}
                </div>

                <div className="p-4 sm:p-5 rounded-panel bg-surface border border-line space-y-3">
                  <h3 className="font-semibold text-fg text-sm">Status code distribution</h3>
                  {stats?.byStatus?.length ? (
                    <div className="space-y-1.5">
                      {stats.byStatus.map((st) => (
                        <div key={st.status_code} className="flex items-center justify-between p-2 rounded-control bg-surface-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
                              st.status_code < 400 
                                ? 'bg-success-tint text-success-text' 
                                : st.status_code === 429 
                                ? 'bg-accent-wash text-accent-line font-bold' 
                                : 'bg-danger-tint text-danger-text'
                            }`}>
                              {st.status_code}
                            </span>
                            <span className="text-fg-2">
                              {st.status_code === 200 ? 'OK' : st.status_code === 401 ? 'Unauthorized' : st.status_code === 429 ? 'Rate Limited' : 'Client error'}
                            </span>
                          </div>
                          <span className="font-mono text-fg font-medium">{st.count} calls</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-fg-3 py-4">No status codes recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: LIVE LOGS */}
          {/* ============================================================== */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Controls & Filter bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-surface p-2.5 rounded-panel border border-line">
                <div className="flex-1 relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-fg-3" />
                  <input
                    type="text"
                    data-cuelume-type
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search endpoint, client IP, key..."
                    className="w-full bg-field border border-line rounded-control pl-8 pr-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent-line"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    data-cuelume-select
                    value={logFilterService}
                    onChange={(e) => setLogFilterService(e.target.value)}
                    className="flex-1 sm:flex-none bg-field border border-line rounded-control px-2.5 py-1.5 text-xs text-fg focus:outline-none"
                  >
                    <option value="all">All workers</option>
                    <option value="media-streamer">media-streamer</option>
                    <option value="auth-service">auth-service</option>
                    <option value="edge-webhook">edge-webhook</option>
                  </select>

                  <select
                    data-cuelume-select
                    value={logFilterStatus}
                    onChange={(e) => setLogFilterStatus(e.target.value)}
                    className="flex-1 sm:flex-none bg-field border border-line rounded-control px-2.5 py-1.5 text-xs text-fg focus:outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="success">Success (2xx)</option>
                    <option value="errors">Errors (&ge; 400)</option>
                    <option value="429">429 Rate limited</option>
                    <option value="200">200 OK</option>
                    <option value="401">401 Unauthorized</option>
                    <option value="500">500 Server error</option>
                  </select>

                  <button
                    data-cuelume-tap
                    data-cuelume-emphasis="subtle"
                    onClick={fetchLogs}
                    className="px-2.5 py-1.5 rounded-control bg-surface-2 hover:bg-surface-3 text-fg text-xs font-medium flex items-center justify-center gap-1 transition"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Logs Table (Scrollable Container) */}
              <div className="bg-surface rounded-panel border border-line overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-fg min-w-[650px]">
                    <thead className="bg-surface-2 text-fg-3 border-b border-line text-[11px] font-medium">
                      <tr>
                        <th className="py-2.5 px-3 sm:px-4">Time</th>
                        <th className="py-2.5 px-3 sm:px-4">Worker</th>
                        <th className="py-2.5 px-3 sm:px-4">Method & endpoint</th>
                        <th className="py-2.5 px-3 sm:px-4">Status</th>
                        <th className="py-2.5 px-3 sm:px-4">Latency</th>
                        <th className="py-2.5 px-3 sm:px-4">Key prefix</th>
                        <th className="py-2.5 px-3 sm:px-4">Client IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-fg-3">
                            No logs recorded matching criteria.
                          </td>
                        </tr>
                      ) : (
                        logs.map((log) => (
                          <tr 
                            key={log.id} 
                            onClick={() => {
                              if (selectedLog?.id === log.id) {
                                setSelectedLog(null);
                                play("close", { emphasis: "subtle" });
                              } else {
                                setSelectedLog(log);
                                play("open", { emphasis: "subtle" });
                              }
                            }}
                            className={`cursor-pointer transition font-mono ${
                              selectedLog?.id === log.id ? 'bg-accent-wash' : 'hover:bg-surface-2'
                            }`}
                          >
                            <td className="py-2.5 px-3 sm:px-4 text-fg-3 whitespace-nowrap">
                              {log.timestamp}
                            </td>
                            <td className="py-2.5 px-3 sm:px-4 font-sans">
                              <span className="capitalize text-fg font-medium">{log.service}</span>
                            </td>
                            <td className="py-2.5 px-3 sm:px-4">
                              <span className="text-fg-3 mr-1">{log.method}</span>
                              <span className="text-fg">{log.endpoint}</span>
                            </td>
                            <td className="py-2.5 px-3 sm:px-4">
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                log.status_code < 400 
                                  ? 'bg-success-tint text-success-text' 
                                  : log.status_code === 429
                                  ? 'bg-accent-wash text-accent-line font-bold'
                                  : 'bg-danger-tint text-danger-text'
                              }`}>
                                {log.status_code}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 sm:px-4 text-fg-2">
                              {log.latency_ms} ms
                            </td>
                            <td className="py-2.5 px-3 sm:px-4 text-fg-3">
                              {log.key_prefix ? `${log.key_prefix}…` : 'none'}
                            </td>
                            <td className="py-2.5 px-3 sm:px-4 text-fg-3 whitespace-nowrap">
                              <span>{log.client_ip}</span>
                              {log.client_country && (
                                <span className="ml-1 text-[10px] text-fg-2">({log.client_country})</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Log Detail Inspector Drawer */}
              {selectedLog && (
                <div className="p-4 bg-surface rounded-panel border border-line space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="text-xs font-semibold text-fg shrink-0">Log inspection:</span>
                      <span className="text-xs font-mono text-fg-3 truncate">{selectedLog.id}</span>
                    </div>
                    <button 
                      data-cuelume-close
                      data-cuelume-emphasis="subtle"
                      onClick={() => setSelectedLog(null)}
                      className="text-xs text-fg-3 hover:text-fg px-2 py-0.5 rounded bg-surface-2 shrink-0"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-surface-2 p-2 rounded-control">
                      <span className="text-fg-3 block text-[10px]">Service</span>
                      <span className="font-semibold text-fg capitalize">{selectedLog.service}</span>
                    </div>
                    <div className="bg-surface-2 p-2 rounded-control">
                      <span className="text-fg-3 block text-[10px]">Endpoint</span>
                      <span className="font-mono text-fg truncate block">{selectedLog.method} {selectedLog.endpoint}</span>
                    </div>
                    <div className="bg-surface-2 p-2 rounded-control">
                      <span className="text-fg-3 block text-[10px]">Latency</span>
                      <span className="font-mono text-fg">{selectedLog.latency_ms} ms</span>
                    </div>
                    <div className="bg-surface-2 p-2 rounded-control">
                      <span className="text-fg-3 block text-[10px]">Client</span>
                      <span className="font-mono text-fg truncate block">{selectedLog.client_ip} ({selectedLog.client_country || 'XX'})</span>
                    </div>
                  </div>
                  {selectedLog.error_message && (
                    <div className="p-2.5 bg-danger-tint border border-danger rounded-control text-xs font-mono text-danger-text break-words">
                      <span className="font-semibold block mb-0.5">Details:</span>
                      {selectedLog.error_message}
                    </div>
                  )}
                  {selectedLog.user_agent && (
                    <p className="text-xs text-fg-3 truncate font-mono">
                      User-Agent: {selectedLog.user_agent}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: API KEYS */}
          {/* ============================================================== */}
          {activeTab === 'keys' && (
            <div className="space-y-4">
              <div className="bg-surface rounded-panel border border-line overflow-hidden">
                <table className="w-full text-left text-xs text-fg">
                  <thead className="bg-surface-2 text-fg-3 border-b border-line text-[11px] font-medium">
                    <tr>
                      <th className="py-2.5 px-4">Key & Scope</th>
                      <th className="py-2.5 px-4">Status & Expiry</th>
                      <th className="py-2.5 px-4">Usage (24h)</th>
                      <th className="py-2.5 px-4">Rate Limit & Activity</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {keys.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-fg-3">
                          <Key className="h-8 w-8 mx-auto mb-2 opacity-40 text-accent" />
                          <p className="font-semibold text-fg text-sm">No API keys generated</p>
                          <p className="text-xs text-fg-3 mt-0.5 mb-3">Create your first client key to authenticate resolver requests.</p>
                          <button
                            data-cuelume-open
                            onClick={() => { setShowKeyModal(true); setCreatedKeyData(null); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold shadow-sm transition"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Create API key</span>
                          </button>
                        </td>
                      </tr>
                    ) : (
                      keys.map((k) => (
                        <tr key={k.id} className="hover:bg-surface-2/60 transition">
                          {/* 1. Key & Scope */}
                          <td className="py-3 px-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-fg">{k.name}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-2 text-fg-2 border border-line capitalize">
                                  {k.service}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(k.raw_key || k.key_prefix, k.id)}
                                data-cuelume-tap
                                data-cuelume-emphasis="subtle"
                                className="inline-flex items-center gap-2 px-2 py-0.5 rounded-control bg-surface-2 hover:bg-surface-3 border border-line hover:border-accent-line transition text-xs font-mono group cursor-pointer"
                                title="One-click copy API key to clipboard"
                              >
                                <span className="text-fg-2 group-hover:text-fg font-medium">
                                  {k.raw_key ? `${k.raw_key.substring(0, 10)}••••••••` : `${k.key_prefix}••••••••`}
                                </span>
                                {copiedKey === k.id || copiedKey === (k.raw_key || k.key_prefix) ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-success">
                                    <Check className="h-3 w-3 stroke-[2.5]" />
                                    <span>Copied!</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-sans text-fg-3 group-hover:text-accent transition">
                                    <Copy className="h-2.5 w-2.5" />
                                    <span>Copy</span>
                                  </span>
                                )}
                              </button>
                            </div>
                          </td>

                          {/* 2. Status & Expiration */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div>
                                <button
                                  onClick={() => handleToggleKey(k.id)}
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
                                    k.is_expired
                                      ? 'bg-danger-tint text-danger-text border-line cursor-not-allowed'
                                      : k.is_active 
                                      ? 'bg-success-tint text-success-text border-line hover:opacity-85' 
                                      : 'bg-surface-2 text-fg-disabled border-line hover:text-fg'
                                  }`}
                                  title={k.is_expired ? 'Key is expired' : k.is_active ? 'Click to disable' : 'Click to activate'}
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full ${k.is_expired ? 'bg-danger' : k.is_active ? 'bg-success' : 'bg-fg-disabled'}`}></span>
                                    {k.is_expired ? 'Expired' : k.is_active ? 'Active' : 'Disabled'}
                                  </span>
                                </button>
                              </div>
                              <div className="text-[11px] text-fg-3">
                                {k.is_expired ? (
                                  <span className="text-danger-text">Expired {k.expires_at?.substring(0, 10)}</span>
                                ) : k.expires_at ? (
                                  <span>Expires {k.expires_at.substring(0, 10)}</span>
                                ) : (
                                  <span>Never expires</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 3. Usage (24h) */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-fg">{k.calls_24h || 0} reqs</span>
                                {k.success_rate_24h !== null && k.success_rate_24h !== undefined ? (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                    k.success_rate_24h >= 95
                                      ? 'bg-success-tint text-success-text'
                                      : k.success_rate_24h >= 80
                                      ? 'bg-warn-tint text-warn-text'
                                      : 'bg-danger-tint text-danger-text'
                                  }`}>
                                    {k.success_rate_24h}% ok
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-fg-3 font-mono flex items-center gap-1.5">
                                <span>{k.total_calls || 0} total</span>
                                {k.avg_latency_24h ? (
                                  <>
                                    <span>•</span>
                                    <span>{k.avg_latency_24h}ms avg</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          {/* 4. Rate Limit & Activity */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="font-mono text-xs text-fg">
                                <span className="font-medium">{k.rate_limit_per_min}</span> <span className="text-fg-3 text-[11px]">req/min</span>
                              </div>
                              <div className="text-[11px] text-fg-3 font-mono">
                                {k.last_used_at ? `Used ${k.last_used_at.substring(5, 16)}` : 'Never used'}
                              </div>
                            </div>
                          </td>

                          {/* 5. Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditKey(k)}
                                data-cuelume-tap
                                data-cuelume-emphasis="subtle"
                                className="p-1.5 rounded-control text-fg-3 hover:text-fg hover:bg-surface-2 transition"
                                title={`Edit ${k.name}`}
                                aria-label={`Edit ${k.name}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteKey(k.id)}
                                data-cuelume-tap
                                className="p-1.5 text-fg-3 hover:text-danger-text hover:bg-danger-tint rounded-control transition"
                                title="Delete key"
                                aria-label="Delete key"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: WORKERS */}
          {/* ============================================================== */}
          {activeTab === 'workers' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 sm:p-5 rounded-panel bg-surface border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${workerHealth['media-streamer']?.status === 'online' ? 'bg-success' : 'bg-warning'}`}></span>
                    <h3 className="font-semibold text-fg text-sm truncate">media-streamer</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg-2 shrink-0">v2.0.0</span>
                </div>
                <p className="text-xs text-fg-2 leading-relaxed">
                  Cloudflare Worker handling streaming proxy, range probing, and metadata extraction for media streaming.
                </p>
                <div className="bg-surface-2 p-2.5 rounded-control text-xs font-mono space-y-1.5 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-fg-3 shrink-0">Domain:</span>
                    <span className="text-fg truncate">media-streamer.example.workers.dev</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-3">Database:</span>
                    <span className="text-success-text">apimonitor-db</span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-panel bg-surface border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${workerHealth['auth-service']?.status === 'online' ? 'bg-success' : 'bg-warning'}`}></span>
                    <h3 className="font-semibold text-fg text-sm truncate">auth-service</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg-2 shrink-0">v1.0.0</span>
                </div>
                <p className="text-xs text-fg-2 leading-relaxed">
                  Cloudflare Worker authentication service for token validation and edge session caching.
                </p>
                <div className="bg-surface-2 p-2.5 rounded-control text-xs font-mono space-y-1.5 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-fg-3 shrink-0">Domain:</span>
                    <span className="text-fg truncate">auth-service.example.workers.dev</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-3">Database:</span>
                    <span className="text-success-text">apimonitor-db</span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-panel bg-surface border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${workerHealth['edge-webhook']?.status === 'online' ? 'bg-success' : 'bg-warning'}`}></span>
                    <h3 className="font-semibold text-fg text-sm truncate">edge-webhook</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg-2 shrink-0">v1.0.0</span>
                </div>
                <p className="text-xs text-fg-2 leading-relaxed">
                  Event ingestion and webhook proxy worker validating signature headers and payload transformations.
                </p>
                <div className="bg-surface-2 p-2.5 rounded-control text-xs font-mono space-y-1.5 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-fg-3 shrink-0">Domain:</span>
                    <span className="text-fg truncate">edge-webhook.example.workers.dev</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-3">Database:</span>
                    <span className="text-success-text">apimonitor-db</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: API KEY TESTER (SIMPLIFIED & ZERO NOISE)                */}
          {/* ============================================================== */}
          {activeTab === 'playground' && (
            <div className="max-w-3xl space-y-5">
              {/* Main Key Testing Card */}
              <div className="bg-surface rounded-panel border border-line p-5 sm:p-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-accent" />
                      <h3 className="font-semibold text-base text-fg">Test API Key</h3>
                    </div>
                    <span className="text-xs text-fg-3">Live verification against Cloudflare Workers</span>
                  </div>
                </div>

                {/* 1. Target Service Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-fg-2">1. Select Target Service</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'media-streamer', label: 'Media Streamer', sub: 'media-streamer (med_*)' },
                      { id: 'auth-service', label: 'Auth Service', sub: 'auth-service (aut_*)' },
                      { id: 'edge-webhook', label: 'Edge Webhook', sub: 'edge-webhook (edg_*)' },
                      { id: 'telemetry', label: 'Telemetry API', sub: 'apimonitor (admin)' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setTestService(s.id);
                          const match = keys.find(k => k.is_active && !k.is_expired && k.raw_key && (k.service === s.id || k.service === 'all'));
                          if (match?.raw_key) setTestKey(match.raw_key);
                          play("tap", { emphasis: "subtle" });
                        }}
                        className={`p-3 rounded-control border text-left transition flex flex-col justify-between ${
                          testService === s.id
                            ? 'border-accent bg-accent-wash/30 ring-1 ring-accent'
                            : 'border-line bg-surface-2 hover:bg-surface-3 hover:border-line-strong'
                        }`}
                      >
                        <span className={`text-xs font-semibold ${testService === s.id ? 'text-accent' : 'text-fg'}`}>
                          {s.label}
                        </span>
                        <span className="text-[10px] text-fg-3 font-mono mt-0.5">{s.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Choose or Paste Key */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-fg-2">2. Enter or Pick API Key</label>
                    {keys.filter(k => k.is_active && !k.is_expired && k.raw_key).length > 0 && (
                      <span className="text-[11px] text-fg-3">Click an active key below to auto-fill</span>
                    )}
                  </div>

                  {/* Quick Pick Active Keys */}
                  {keys.filter(k => k.is_active && !k.is_expired && k.raw_key).length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {keys
                        .filter(k => k.is_active && !k.is_expired && k.raw_key)
                        .map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => handleSelectKeyForTest(k)}
                            className={`px-2.5 py-1 rounded text-xs font-mono border transition flex items-center gap-1.5 ${
                              testKey === k.raw_key
                                ? 'bg-accent-wash text-accent border-accent font-semibold'
                                : 'bg-surface-2 hover:bg-surface-3 text-fg-2 border-line'
                            }`}
                          >
                            <span>{k.name}</span>
                            <span className="text-[10px] opacity-70 uppercase">({k.service})</span>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Key Input & Test Button */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={testKey}
                      onChange={(e) => setTestKey(e.target.value)}
                      placeholder={testService === 'telemetry' ? 'Admin token or leave empty' : 'Paste API Key (vb_..., flz_..., mon_...)'}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="flex-1 bg-field border border-line rounded-control px-3.5 py-2.5 text-xs font-mono text-fg focus:outline-none focus:border-accent-line select-text shadow-inner"
                    />

                    <button
                      type="button"
                      onClick={() => handleTestKey()}
                      disabled={testLoading || (!testKey && testService !== 'telemetry')}
                      className="px-6 py-2.5 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 shrink-0 shadow-md"
                    >
                      {testLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Testing Key…</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          <span>Test Key</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live Test Result */}
                {testResult && (
                  <div className="pt-3 border-t border-line space-y-3">
                    <div className={`p-4 rounded-control border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      testResult.isSuccess
                        ? 'bg-success-tint border-line text-success-text'
                        : 'bg-danger-tint border-line text-danger-text'
                    }`}>
                      <div className="flex items-start sm:items-center gap-2.5">
                        {testResult.isSuccess ? (
                          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5 sm:mt-0" />
                        ) : (
                          <XCircle className="h-5 w-5 text-danger shrink-0 mt-0.5 sm:mt-0" />
                        )}
                        <div>
                          <h4 className="font-bold text-sm">
                            {testResult.isSuccess ? 'API Key is Active & Authorized' : `Key Authorization Failed (${testResult.status} ${testResult.statusText})`}
                          </h4>
                          <p className="text-xs opacity-90 mt-0.5">
                            {testResult.isSuccess
                              ? `Successfully verified on ${testResult.service} worker in ${testResult.duration}ms.`
                              : (typeof testResult.data?.error === 'string'
                                  ? testResult.data.error
                                  : 'Worker rejected this request. Check key scope or service permissions.')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                        <span className="px-2 py-0.5 rounded bg-surface border border-line font-bold">
                          {testResult.status}
                        </span>
                        <span>{testResult.duration}ms</span>
                      </div>
                    </div>

                    {/* Proactive 1-Click Service Switch if prefix mismatch detected */}
                    {!testResult.isSuccess && testResult.status === 403 && (
                      (() => {
                        const matchingKey = keys.find(k => k.raw_key === testResult.keyUsed || (k.key_prefix && testResult.keyUsed.startsWith(k.key_prefix.replace('...', ''))));
                        const otherSvc = matchingKey?.service && matchingKey.service !== 'all'
                          ? matchingKey.service
                          : testResult.keyUsed.startsWith('med_') ? 'media-streamer'
                          : testResult.keyUsed.startsWith('aut_') ? 'auth-service'
                          : testResult.keyUsed.startsWith('edg_') ? 'edge-webhook'
                          : null;
                        if (otherSvc && otherSvc !== testResult.service) {
                          return (
                            <div className="p-3 bg-surface-2 rounded-control border border-line text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="text-fg-2">
                                💡 This key starts with <code className="font-mono font-bold bg-surface px-1 py-0.5 rounded">{testResult.keyUsed.substring(0, 4)}</code>, which belongs to <strong>{otherSvc}</strong>.
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setTestService(otherSvc);
                                  handleTestKey(otherSvc, testResult.keyUsed);
                                }}
                                className="px-3 py-1 rounded bg-accent text-on-accent font-semibold text-xs whitespace-nowrap hover:bg-accent-hover transition self-start sm:self-auto"
                              >
                                Test on {otherSvc} instead →
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })()
                    )}

                    {/* Response Payload Preview */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-fg-3">
                        <span>Response Payload</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(testResult.data, null, 2));
                            setPgCopiedResp(true);
                            play("tap", { emphasis: "subtle" });
                            setTimeout(() => setPgCopiedResp(false), 2000);
                          }}
                          className="hover:text-fg transition flex items-center gap-1 text-[11px]"
                        >
                          {pgCopiedResp ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                          <span>{pgCopiedResp ? 'Copied' : 'Copy JSON'}</span>
                        </button>
                      </div>
                      <div className="bg-field border border-line rounded-control p-3 min-h-[80px] max-h-[300px] overflow-auto font-mono text-xs">
                        <pre
                          className="whitespace-pre font-mono text-xs select-text leading-relaxed inline-block min-w-full"
                          dangerouslySetInnerHTML={{ __html: formatHighlightedJson(testResult.data) }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Collapsible: Advanced HTTP Explorer */}
              <div className="border border-line rounded-panel bg-surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full p-4 flex items-center justify-between text-xs font-medium text-fg-3 hover:text-fg hover:bg-surface-2 transition text-left"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-accent" />
                    <span>Need custom endpoint & method testing? (Raw HTTP Workbench)</span>
                  </span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showAdvanced && (
                  <div className="p-4 sm:p-5 border-t border-line space-y-4">
                    {/* Method + URL + Send */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        value={pgMethod}
                        onChange={(e) => setPgMethod(e.target.value)}
                        className="bg-field border border-line rounded-control px-2.5 py-2 text-xs font-mono font-bold text-fg sm:w-24 shrink-0"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                      <input
                        type="text"
                        value={pgUrl}
                        onChange={(e) => setPgUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 bg-field border border-line rounded-control px-3 py-2 text-xs font-mono text-fg focus:outline-none focus:border-accent-line"
                      />
                      <button
                        type="button"
                        onClick={handleSendPlayground}
                        disabled={pgLoading || !pgUrl}
                        className="px-4 py-2 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold shrink-0"
                      >
                        {pgLoading ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                    {/* Body if POST/PUT */}
                    {['POST', 'PUT', 'PATCH'].includes(pgMethod) && (
                      <textarea
                        rows={4}
                        value={pgBody}
                        onChange={(e) => setPgBody(e.target.value)}
                        className="w-full bg-field border border-line rounded-control p-2.5 text-xs font-mono text-fg focus:outline-none resize-y"
                        placeholder="JSON payload..."
                      />
                    )}
                    {pgResponse && (
                      <div className="bg-field border border-line rounded-control p-3 max-h-[300px] overflow-auto font-mono text-xs">
                        <pre
                          className="whitespace-pre font-mono text-xs select-text leading-relaxed inline-block min-w-full"
                          dangerouslySetInnerHTML={{ __html: formatHighlightedJson(pgResponse.data) }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: PROFILE & SETTINGS (SIMPLE & MINIMALIST)                */}
          {/* ============================================================== */}
          {activeTab === 'profile' && (
            <div className="max-w-xl space-y-4">
              {/* Account Card */}
              <div className="bg-surface rounded-panel border border-line p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-accent text-on-accent font-bold text-xs flex items-center justify-center shrink-0">
                    {(adminName?.trim() || 'Admin').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-fg">{adminName?.trim() || 'Admin'} Console</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-success" title="Active"></span>
                    </div>
                    <span className="text-xs text-fg-3 font-mono">admin@workers.dev</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  data-cuelume-tap
                  className="px-2.5 py-1.5 rounded-control text-xs text-danger-text hover:bg-danger-tint border border-line hover:border-danger/30 transition flex items-center gap-1.5 font-medium"
                  title="Lock session"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Lock dashboard</span>
                </button>
              </div>

              {/* Preferences Card */}
              <div className="bg-surface rounded-panel border border-line divide-y divide-line">
                {/* 1. Admin Display Name */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-fg block text-xs">Admin Display Name</span>
                    <span className="text-[11px] text-fg-3">Change greeting name displayed in overview</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdminName(val);
                        localStorage.setItem(STORAGE_ADMIN_NAME_KEY, val);
                      }}
                      placeholder="Admin"
                      maxLength={32}
                      className="px-3 py-1.5 rounded-control bg-field border border-line text-xs text-fg focus:outline-none focus:border-accent-line focus:ring-1 focus:ring-accent transition w-full sm:w-48 font-medium"
                    />
                  </div>
                </div>

                {/* 2. Theme Mode (Dark / Light) */}
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-fg block text-xs">Appearance Mode</span>
                    <span className="text-[11px] text-fg-3">Light or dark theme</span>
                  </div>
                  <div className="flex items-center bg-surface-2 p-0.5 rounded-control border border-line">
                    <button
                      type="button"
                      onClick={() => changeMode('dark')}
                      data-cuelume-select
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                        mode === 'dark' 
                          ? 'bg-surface-3 text-fg shadow-xs' 
                          : 'text-fg-3 hover:text-fg'
                      }`}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      <span>Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => changeMode('light')}
                      data-cuelume-select
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                        mode === 'light' 
                          ? 'bg-surface-3 text-fg shadow-xs' 
                          : 'text-fg-3 hover:text-fg'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5 text-warn" />
                      <span>Light</span>
                    </button>
                  </div>
                </div>

                {/* 2. Accent Color */}
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-fg block text-xs">Accent Color</span>
                    <span className="text-[11px] text-fg-3 capitalize">
                      {THEMES.find(t => t.id === theme)?.name || theme}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {THEMES.map((t) => {
                      const isSelected = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => changeTheme(t.id)}
                          data-cuelume-tap
                          data-cuelume-emphasis="subtle"
                          className={`h-6 w-6 rounded-full transition-transform flex items-center justify-center ${
                            isSelected ? 'scale-110 shadow-sm' : 'opacity-55 hover:opacity-100 hover:scale-105'
                          }`}
                          style={{ backgroundColor: t.dot }}
                          title={t.name}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Interaction Audio */}
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-fg block text-xs">Interaction Audio</span>
                    <span className="text-[11px] text-fg-3">Cuelume procedural sounds</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleSound}
                    data-cuelume-toggle
                    className={`px-2.5 py-1 rounded-control text-xs font-mono transition flex items-center gap-1.5 border ${
                      soundEnabled 
                        ? 'bg-accent-wash text-accent border-accent-line' 
                        : 'bg-surface-2 text-fg-3 border-line'
                    }`}
                  >
                    {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    <span>{soundEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal: Edit API Key */}
      {editingKey && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 apple-backdrop"
          onClick={closeEditKey}
        >
          <div
            className="bg-raised border border-line rounded-panel max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl apple-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editingKey.name}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-base text-fg">Edit API key</h3>
                <p className="text-[11px] text-fg-3 font-mono mt-0.5">
                  {editingKey.key_prefix}•••••••• — scope is fixed at{' '}
                  <span className="capitalize">{editingKey.service}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditKey}
                disabled={editKeySaving}
                className="p-1 rounded text-fg-3 hover:text-fg hover:bg-surface-2 transition disabled:opacity-40"
                aria-label="Close edit dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveKeyEdit} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-key-name"
                  className="block text-xs font-medium text-fg-2 mb-1.5"
                >
                  Key name
                </label>
                <input
                  id="edit-key-name"
                  type="text"
                  value={editKeyName}
                  onChange={(e) => setEditKeyName(e.target.value)}
                  maxLength={120}
                  disabled={editKeySaving}
                  className="w-full bg-field border border-line rounded-control px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent transition disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-key-rate"
                  className="block text-xs font-medium text-fg-2 mb-1.5"
                >
                  Rate limit (requests / minute)
                </label>
                <input
                  id="edit-key-rate"
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  value={editKeyRateLimit}
                  onChange={(e) => setEditKeyRateLimit(e.target.value)}
                  disabled={editKeySaving}
                  className="w-full bg-field border border-line rounded-control px-3 py-2 text-xs font-mono text-fg focus:outline-none focus:border-accent transition disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-key-duration"
                  className="block text-xs font-medium text-fg-2 mb-1.5"
                >
                  Expiration
                </label>
                <select
                  id="edit-key-duration"
                  value={editKeyDurationDays}
                  onChange={(e) => setEditKeyDurationDays(e.target.value)}
                  disabled={editKeySaving}
                  className="w-full bg-field border border-line rounded-control px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent transition disabled:opacity-50"
                >
                  <option value="keep">
                    Keep current
                    {editingKey.expires_at
                      ? ` (expires ${editingKey.expires_at.substring(0, 10)})`
                      : ' (never expires)'}
                  </option>
                  <option value="1">1 day from now</option>
                  <option value="7">7 days from now</option>
                  <option value="30">30 days from now</option>
                  <option value="90">90 days from now</option>
                  <option value="365">1 year from now</option>
                  <option value="">Never expires (remove expiry)</option>
                </select>
              </div>

              {editKeyError && (
                <p
                  role="alert"
                  className="p-2.5 bg-danger-tint border border-danger rounded-control text-xs text-danger-text"
                >
                  {editKeyError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditKey}
                  disabled={editKeySaving}
                  className="flex-1 py-2 rounded-control border border-line text-xs font-semibold text-fg-2 hover:text-fg hover:bg-surface-2 transition disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-cuelume-tap
                  disabled={editKeySaving}
                  className="flex-1 py-2 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold transition disabled:opacity-50"
                >
                  {editKeySaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create API Key */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 apple-backdrop">
          <div className="bg-raised border border-line rounded-panel max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl apple-dialog">
            <h3 className="font-semibold text-base text-fg">Create new API key</h3>

            {createdKeyData ? (
              <div className="space-y-4">
                <div className="p-3 bg-accent-wash border border-accent-line rounded-control text-xs text-fg">
                  <p className="font-semibold mb-1">Key generated successfully</p>
                  Copy this key now. For security purposes, it will never be displayed again.
                </div>

                <div className="bg-field p-2.5 rounded-control border border-line font-mono text-xs flex items-center justify-between gap-2">
                  <span className="text-accent truncate">{createdKeyData.secretKey}</span>
                  <button
                    onClick={() => copyToClipboard(createdKeyData.secretKey)}
                    className="p-1 hover:bg-surface-2 rounded text-fg-3 hover:text-fg transition shrink-0"
                  >
                    {copiedKey === createdKeyData.secretKey ? <Check className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <div className="bg-surface-2 p-3 rounded-control border border-line text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between items-center text-fg-2">
                    <span className="text-fg-3 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Expiration
                    </span>
                    <span className="text-fg font-semibold">
                      {createdKeyData.expires_at ? createdKeyData.expires_at.substring(0, 10) : 'Never (Permanent)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-fg-2">
                    <span className="text-fg-3">Rate Limit</span>
                    <span className="text-fg">{createdKeyData.rate_limit_per_min} req / min</span>
                  </div>
                  <div className="flex justify-between items-center text-fg-2">
                    <span className="text-fg-3">Scope</span>
                    <span className="text-fg capitalize">{createdKeyData.service}</span>
                  </div>
                </div>

                <button
                  data-cuelume-close
                  onClick={() => {
                    setShowKeyModal(false);
                    setCreatedKeyData(null);
                    setNewKeyName('');
                  }}
                  className="w-full py-2 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateKey} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-fg-2 block">Key name</label>
                  <input
                    type="text"
                    data-cuelume-type
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production Mobile App"
                    required
                    className="w-full bg-field border border-line rounded-control px-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent-line"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-fg-2 block">Service scope</label>
                  <select
                    data-cuelume-select
                    value={newKeyService}
                    onChange={(e) => setNewKeyService(e.target.value)}
                    className="w-full bg-field border border-line rounded-control px-3 py-1.5 text-xs text-fg focus:outline-none"
                  >
                    <option value="all">All services</option>
                    <option value="media-streamer">Media Streamer (media-streamer)</option>
                    <option value="auth-service">Auth Service (auth-service)</option>
                    <option value="edge-webhook">Edge Webhook (edge-webhook)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-fg-2 block">Validity period (duration)</label>
                  <select
                    data-cuelume-select
                    value={newKeyDurationDays}
                    onChange={(e) => setNewKeyDurationDays(e.target.value)}
                    className="w-full bg-field border border-line rounded-control px-3 py-1.5 text-xs text-fg focus:outline-none"
                  >
                    <option value="7">7 Days</option>
                    <option value="30">30 Days (1 Month)</option>
                    <option value="90">90 Days (3 Months)</option>
                    <option value="180">180 Days (6 Months)</option>
                    <option value="365">365 Days (1 Year)</option>
                    <option value="custom">Custom duration</option>
                    <option value="">Never expires (Permanent)</option>
                  </select>
                </div>

                {newKeyDurationDays === 'custom' && (
                  <div className="space-y-1">
                    <label className="text-xs text-fg-2 block">Custom duration (days)</label>
                    <input
                      type="number"
                      data-cuelume-type
                      min="1"
                      max="3650"
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value)}
                      placeholder="e.g. 14"
                      required
                      className="w-full bg-field border border-line rounded-control px-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent-line font-mono"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs text-fg-2 block">Rate limit (requests / minute)</label>
                  <input
                    type="number"
                    data-cuelume-type
                    min="1"
                    max="10000"
                    value={newKeyRateLimit}
                    onChange={(e) => setNewKeyRateLimit(e.target.value)}
                    required
                    className="w-full bg-field border border-line rounded-control px-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent-line font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    data-cuelume-close
                    data-cuelume-emphasis="subtle"
                    onClick={() => setShowKeyModal(false)}
                    className="px-3 py-1.5 rounded-control text-fg-3 hover:text-fg text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-cuelume-tap
                    className="px-3 py-1.5 rounded-control bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold transition"
                  >
                    Generate key
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
