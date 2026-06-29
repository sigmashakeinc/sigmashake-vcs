#!/usr/bin/env bun

const HOST = process.env.MOCK_CHAT_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MOCK_CHAT_PORT ?? 8081);

const catalogItems = [
  { key: "hair_short_dark", slot: "hair", name: "Short Dark Hair", rarity: "common", price: 0 },
  { key: "hair_neon_mint", slot: "hair", name: "Neon Mint Hair", rarity: "rare", price: 120 },
  { key: "head_vr_visor", slot: "head", name: "VR Visor", rarity: "rare", price: 160 },
  { key: "dress_dev_hoodie", slot: "dress", name: "Dev Hoodie", rarity: "common", price: 0 },
  { key: "dress_stream_jacket", slot: "dress", name: "Stream Jacket", rarity: "epic", price: 240 },
  { key: "eyes_focus_green", slot: "eyes", name: "Focus Green Eyes", rarity: "common", price: 0 },
  {
    key: "accessory_debug_duck",
    slot: "accessory",
    name: "Debug Duck",
    rarity: "legendary",
    price: 500,
  },
];

const catalogBySlot = catalogItems.reduce((acc, item) => {
  if (!acc[item.slot]) acc[item.slot] = [];
  acc[item.slot].push(item);
  return acc;
}, {});

const accounts = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

async function readJson(request) {
  if (request.method !== "POST") return {};
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function identity(url, body = {}) {
  const source = String(body.source ?? url.searchParams.get("source") ?? "twitch").toLowerCase();
  const login = String(
    body.login ??
      body.twitch_login ??
      url.searchParams.get("login") ??
      url.searchParams.get("twitch_login") ??
      "devviewer",
  ).toLowerCase();
  const userId = String(
    body.user_id ?? body.twitch_user_id ?? url.searchParams.get("user_id") ?? "dev-user-1",
  );
  const display = String(
    body.display ?? body.twitch_display ?? url.searchParams.get("display") ?? login,
  );
  return { source, login, user_id: userId, display, twitch_login: login, twitch_user_id: userId };
}

function itemFor(key) {
  return catalogItems.find((item) => item.key === key) ?? null;
}

function accountFor(id) {
  const key = `${id.source}:${id.login}`;
  if (!accounts.has(key)) {
    accounts.set(key, {
      identity: id,
      xp: 1200,
      inventory: ["hair_short_dark", "dress_dev_hoodie", "eyes_focus_green"],
      loadout: {
        body: "human",
        hair: "hair_short_dark",
        dress: "dress_dev_hoodie",
        eyes: "eyes_focus_green",
        c_skin: "#8d5524",
        c_hair: "#1f2937",
        hue: 0,
      },
      shop: {
        ends_ms: Date.now() + 1000 * 60 * 60,
        discount: 0,
        items: catalogItems.filter((item) => item.price > 0).slice(0, 4),
      },
    });
  }
  return accounts.get(key);
}

function accountResponse(account, extra = {}) {
  return {
    ok: true,
    source: account.identity.source,
    login: account.identity.login,
    user_id: account.identity.user_id,
    display: account.identity.display,
    twitch_login: account.identity.twitch_login,
    twitch_user_id: account.identity.twitch_user_id,
    loadout: account.loadout,
    inventory: account.inventory,
    shop: account.shop,
    xp: account.xp,
    ...extra,
  };
}

function requireSlotItem(body) {
  const slot = String(body.slot ?? "");
  const itemKey = String(body.item_key ?? body.itemKey ?? "");
  if (!slot || !itemKey) return { error: "slot_and_item_key_required" };
  const item = itemFor(itemKey);
  if (!item) return { error: "unknown_item" };
  if (item.slot !== slot) return { error: "slot_mismatch" };
  return { slot, item };
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });
    if (url.pathname === "/healthz") return json({ ok: true, service: "mock-chat" });
    if (!url.pathname.startsWith("/api/v1/vcs/")) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    const body = await readJson(request);
    const id = identity(url, body);
    const account = accountFor(id);
    const endpoint = url.pathname.slice("/api/v1/vcs/".length);

    if (request.method === "GET" && endpoint === "me") {
      return json(accountResponse(account));
    }
    if (request.method === "GET" && endpoint === "catalog") {
      return json({ ok: true, items: catalogBySlot, all: catalogItems });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    if (endpoint === "equip") {
      const parsed = requireSlotItem(body);
      if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
      if (!account.inventory.includes(parsed.item.key)) account.inventory.push(parsed.item.key);
      account.loadout[parsed.slot] = parsed.item.key;
      return json(accountResponse(account));
    }

    if (endpoint === "unequip") {
      const slot = String(body.slot ?? "");
      if (!slot) return json({ ok: false, error: "slot_required" }, 400);
      delete account.loadout[slot];
      return json(accountResponse(account));
    }

    if (endpoint === "buy") {
      const itemKey = String(body.item_key ?? body.itemKey ?? "");
      const item = itemFor(itemKey);
      if (!item) return json({ ok: false, error: "unknown_item" }, 400);
      if (!account.inventory.includes(item.key)) account.inventory.push(item.key);
      return json(accountResponse(account, { bought: item.key }));
    }

    if (endpoint === "color") {
      const slot = String(body.slot ?? "");
      const hex = String(body.hex ?? "");
      if (!slot || !hex.match(/^#[0-9a-fA-F]{6}$/)) {
        return json({ ok: false, error: "slot_and_hex_required" }, 400);
      }
      account.loadout[slot] = hex;
      return json(accountResponse(account));
    }

    if (endpoint === "hue") {
      account.loadout.hue = Number(body.hue ?? 0);
      return json(accountResponse(account));
    }

    if (endpoint === "raw_slot") {
      const slot = String(body.slot ?? "");
      if (!slot) return json({ ok: false, error: "slot_required" }, 400);
      account.loadout[slot] = body.value ?? "";
      return json(accountResponse(account));
    }

    if (endpoint === "clear_raw_slot") {
      const slot = String(body.slot ?? "");
      if (!slot) return json({ ok: false, error: "slot_required" }, 400);
      delete account.loadout[slot];
      return json(accountResponse(account));
    }

    if (endpoint === "body") {
      account.loadout.body = String(body.body ?? "human");
      return json(accountResponse(account));
    }

    if (endpoint === "clear_body") {
      delete account.loadout.body;
      return json(accountResponse(account));
    }

    return json({ ok: false, error: "unknown_vcs_endpoint", endpoint }, 404);
  },
});

console.log(`[mock-chat] listening on http://${HOST}:${PORT}`);
