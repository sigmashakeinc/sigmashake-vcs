#!/usr/bin/env bun

const CHAT_ELIXIR_BASE = process.env.CHAT_ELIXIR_BASE ?? "http://127.0.0.1:8081";
const MMO_BASE_URL = process.env.MMO_BASE_URL ?? "http://127.0.0.1:7777";
const VCS_BASE_URL = process.env.VCS_BASE_URL ?? "http://127.0.0.1:8787";
const VCS_HMAC_KEY = process.env.VCS_HMAC_KEY ?? "";
const FETCH_TIMEOUT_MS = Number(process.env.VCS_BRIDGE_FETCH_TIMEOUT_MS ?? 4000);
const RECONNECT_DELAY_MS = Number(process.env.VCS_BRIDGE_RECONNECT_MS ?? 5000);

const MMO_PATHS = new Set([
  "/api/v1/vcs/combat-gear",
  "/api/v1/vcs/combat-loadout",
  "/api/v1/vcs/combat-equip",
  "/api/v1/vcs/combat-sigma",
  "/api/v1/vcs/combat-passive-tree",
  "/api/v1/vcs/combat-passives",
  "/api/v1/vcs/combat-reserve",
  "/api/v1/vcs/combat-position",
  "/api/v1/vcs/combat-swap-set",
  "/api/v1/vcs/combat-weapon-catalog",
  "/api/v1/vcs/combat-weapons",
]);

async function hmacSign(body, key) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function rpcLogin(body = {}) {
  return String(body.login ?? body.twitch_login ?? "").toLowerCase();
}

function rpcSource(body = {}) {
  return String(body.source ?? "twitch").toLowerCase();
}

async function proxyToMmo(rpc) {
  if (rpc.path === "/api/v1/vcs/combat-passive-tree") {
    return upstreamText(`${MMO_BASE_URL}/api/passive-tree`, { method: "GET" }, "mmo");
  }
  if (rpc.path === "/api/v1/vcs/combat-weapon-catalog") {
    return upstreamText(`${MMO_BASE_URL}/api/weapon-catalog`, { method: "GET" }, "mmo");
  }

  if (rpcSource(rpc.body) !== "twitch") {
    return {
      status: 200,
      body: JSON.stringify({ ok: true, unavailable: true, reason: "combat_twitch_only" }),
    };
  }

  const login = rpcLogin(rpc.body);
  if (!login.match(/^[a-z0-9_]{1,32}$/)) {
    return { status: 400, body: JSON.stringify({ ok: false, error: "invalid_login" }) };
  }

  if (rpc.path === "/api/v1/vcs/combat-loadout") {
    return upstreamText(`${MMO_BASE_URL}/api/sigma/${login}/loadout`, { method: "GET" }, "mmo");
  }
  if (rpc.path === "/api/v1/vcs/combat-equip") {
    return upstreamText(
      `${MMO_BASE_URL}/api/sigma/${login}/equip`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot: rpc.body?.slot, index: rpc.body?.index }),
      },
      "mmo",
    );
  }
  if (rpc.path === "/api/v1/vcs/combat-passives") {
    return upstreamText(
      `${MMO_BASE_URL}/api/sigma/${login}/passives`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passives: rpc.body?.passives ?? [], set: rpc.body?.set }),
      },
      "mmo",
    );
  }
  if (rpc.path === "/api/v1/vcs/combat-reserve") {
    return upstreamText(
      `${MMO_BASE_URL}/api/sigma/${login}/reserve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reserved: rpc.body?.reserved ?? [], set: rpc.body?.set }),
      },
      "mmo",
    );
  }
  if (rpc.path === "/api/v1/vcs/combat-position") {
    return upstreamText(
      `${MMO_BASE_URL}/api/sigma/${login}/position`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: rpc.body?.position, set: rpc.body?.set }),
      },
      "mmo",
    );
  }
  if (rpc.path === "/api/v1/vcs/combat-swap-set") {
    return upstreamText(
      `${MMO_BASE_URL}/api/sigma/${login}/swap-set`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ set: rpc.body?.set }),
      },
      "mmo",
    );
  }
  if (rpc.path === "/api/v1/vcs/combat-weapons") {
    const url = `${MMO_BASE_URL}/api/sigma/${login}/weapons`;
    if (rpc.method === "POST") {
      return upstreamText(
        url,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weapons: rpc.body?.weapons ?? [], set: rpc.body?.set }),
        },
        "mmo",
      );
    }
    return upstreamText(url, { method: "GET" }, "mmo");
  }

  return upstreamText(`${MMO_BASE_URL}/api/sigma/${login}`, { method: "GET" }, "mmo");
}

async function proxyToChat(rpc) {
  let target = CHAT_ELIXIR_BASE + rpc.path;
  const init = { method: rpc.method };

  if (rpc.method === "POST") {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(rpc.body ?? {});
  } else if (rpc.body && Object.keys(rpc.body).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rpc.body)) {
      if (value !== null && value !== undefined) params.set(key, String(value));
    }
    target += `${target.includes("?") ? "&" : "?"}${params}`;
  }

  return upstreamText(target, init, "chat");
}

async function upstreamText(url, init, service) {
  try {
    const res = await fetchWithTimeout(url, init);
    return { status: res.status, body: await res.text() };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    console.error(`[vcs-bridge] ${service} upstream failed`, url, timeout ? "timeout" : err);
    return {
      status: timeout ? 504 : 502,
      body: JSON.stringify({
        ok: false,
        error: timeout ? `${service}_timeout` : `${service}_failed`,
      }),
    };
  }
}

async function connect() {
  const ts = Math.floor(Date.now() / 1000);
  const signature = await hmacSign(`timestamp:${ts}`, VCS_HMAC_KEY);
  const wsUrl = `${VCS_BASE_URL.replace(/^http/, "ws")}/ws/streamer`;
  const ws = new WebSocket(wsUrl, {
    headers: {
      "X-Vcs-Signature": signature,
      "X-Vcs-Timestamp": String(ts),
    },
  });

  let heartbeat = null;

  ws.addEventListener("open", () => {
    console.log(
      `[vcs-bridge] connected to ${VCS_BASE_URL}; chat=${CHAT_ELIXIR_BASE}; mmo=${MMO_BASE_URL}`,
    );
    heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      }
    }, 15000);
  });

  ws.addEventListener("message", async (event) => {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type === "pong") return;
    if (msg.type !== "rpc" || !msg.req_id || !msg.path) return;

    const reply = MMO_PATHS.has(msg.path) ? await proxyToMmo(msg) : await proxyToChat(msg);
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "rpc_reply",
        req_id: msg.req_id,
        status: reply.status,
        body: reply.body,
      }),
    );
  });

  ws.addEventListener("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    console.log(`[vcs-bridge] disconnected; reconnecting in ${RECONNECT_DELAY_MS}ms`);
    setTimeout(() => {
      connect().catch((err) => console.error("[vcs-bridge] reconnect failed", err));
    }, RECONNECT_DELAY_MS);
  });

  ws.addEventListener("error", (event) => {
    console.error("[vcs-bridge] websocket error", event.message ?? event.type ?? event);
  });
}

if (!VCS_HMAC_KEY) {
  console.error("[vcs-bridge] VCS_HMAC_KEY is required");
  process.exit(1);
}

connect().catch((err) => {
  console.error("[vcs-bridge] failed to start", err);
  process.exit(1);
});
