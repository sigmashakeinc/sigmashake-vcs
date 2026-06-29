#!/usr/bin/env bun

const HOST = process.env.MOCK_MMO_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MOCK_MMO_PORT ?? 7777);

const passiveTree = {
  ok: true,
  points: 12,
  nodes: [
    { id: "root", name: "Baseline Runtime", x: 0, y: 0, cost: 0, mods: { hpAdd: 10 } },
    { id: "focus", name: "Focus Cache", x: 1, y: -1, cost: 1, mods: { critAdd: 0.03 } },
    { id: "shipping", name: "Shipping Momentum", x: 1, y: 1, cost: 1, mods: { speedMul: 1.04 } },
    { id: "resilience", name: "Incident Resilience", x: 2, y: 0, cost: 2, mods: { defAdd: 4 } },
  ],
  edges: [
    ["root", "focus"],
    ["root", "shipping"],
    ["focus", "resilience"],
    ["shipping", "resilience"],
  ],
};

const weaponCatalog = {
  ok: true,
  maxSlots: 6,
  weapons: [
    { id: "keyboard", name: "Mechanical Keyboard", family: "melee", rarity: "common" },
    { id: "laser_pointer", name: "Laser Pointer", family: "ranged", rarity: "rare" },
    { id: "rubber_duck", name: "Rubber Duck Oracle", family: "magic", rarity: "epic" },
    { id: "deploy_button", name: "Deploy Button", family: "tech", rarity: "legendary" },
  ],
  evolutions: [
    {
      id: "rubber_duck_plus_keyboard",
      requires: ["rubber_duck", "keyboard"],
      name: "Pair Debugger",
    },
  ],
};

const sigmas = new Map();

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

function defaultSigma(login) {
  return {
    ok: true,
    login,
    level: 7,
    depth: 4,
    zone: "dev_lab",
    hp: 92,
    maxHp: 110,
    position: "midline",
    activeSet: "A",
    passivePoints: 12,
    passives: ["root", "focus"],
    reserved: ["build_guard"],
    spirit: 34,
    spiritUsed: 8,
    gear: {
      weapon: {
        index: 0,
        name: "Patch Blade",
        rarity: "rare",
        power: 18,
        slot: "weapon",
        family: "melee",
      },
      armor: { index: 1, name: "Rollback Hoodie", rarity: "common", power: 9, slot: "armor" },
      charm: { index: 2, name: "Green Check Charm", rarity: "epic", power: 7, slot: "charm" },
    },
    inventory: [
      { index: 0, name: "Patch Blade", rarity: "rare", power: 18, slot: "weapon", family: "melee" },
      { index: 1, name: "Rollback Hoodie", rarity: "common", power: 9, slot: "armor" },
      { index: 2, name: "Green Check Charm", rarity: "epic", power: 7, slot: "charm" },
      {
        index: 3,
        name: "Latency Wand",
        rarity: "rare",
        power: 15,
        slot: "weapon",
        family: "magic",
      },
    ],
    weapons: ["keyboard", "rubber_duck"],
    activeWeapon: "keyboard",
    combat: {
      gems: [{ id: "g1", x: 0.25, y: 0.5, value: 2 }],
      faint: false,
      dps: 42,
    },
  };
}

function sigmaFor(login) {
  if (!sigmas.has(login)) sigmas.set(login, defaultSigma(login));
  return sigmas.get(login);
}

function loginFromPath(pathname) {
  const match = pathname.match(/^\/api\/sigma\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  const login = decodeURIComponent(match[1]).toLowerCase();
  if (!login.match(/^[a-z0-9_]{1,32}$/)) return null;
  return { login, tail: match[2] ?? "" };
}

function publicSigma(sigma) {
  return {
    ok: true,
    login: sigma.login,
    level: sigma.level,
    depth: sigma.depth,
    zone: sigma.zone,
    hp: sigma.hp,
    maxHp: sigma.maxHp,
    gear: sigma.gear,
    passives: sigma.passives,
    reserved: sigma.reserved,
    position: sigma.position,
    activeSet: sigma.activeSet,
    passivePoints: sigma.passivePoints,
    spirit: sigma.spirit,
    spiritUsed: sigma.spiritUsed,
    combat: sigma.combat,
  };
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });
    if (url.pathname === "/healthz") return json({ ok: true, service: "mock-mmo" });
    if (request.method === "GET" && url.pathname === "/api/passive-tree") return json(passiveTree);
    if (request.method === "GET" && url.pathname === "/api/weapon-catalog")
      return json(weaponCatalog);

    const parsed = loginFromPath(url.pathname);
    if (!parsed) return json({ ok: false, error: "not_found" }, 404);

    const sigma = sigmaFor(parsed.login);
    const body = await readJson(request);

    if (request.method === "GET" && parsed.tail === "") return json(publicSigma(sigma));
    if (request.method === "GET" && parsed.tail === "loadout") {
      return json({ ok: true, login: sigma.login, gear: sigma.gear, inventory: sigma.inventory });
    }
    if (request.method === "POST" && parsed.tail === "equip") {
      const slot = String(body.slot ?? "");
      const index = Number(body.index);
      const item = sigma.inventory.find((entry) => entry.index === index && entry.slot === slot);
      if (!item) return json({ ok: false, error: "item_not_found" }, 404);
      sigma.gear[slot] = item;
      return json({ ok: true, login: sigma.login, gear: sigma.gear, inventory: sigma.inventory });
    }
    if (request.method === "POST" && parsed.tail === "passives") {
      sigma.passives = Array.isArray(body.passives) ? body.passives.map(String) : [];
      return json(publicSigma(sigma));
    }
    if (request.method === "POST" && parsed.tail === "reserve") {
      sigma.reserved = Array.isArray(body.reserved) ? body.reserved.map(String) : [];
      return json(publicSigma(sigma));
    }
    if (request.method === "POST" && parsed.tail === "position") {
      sigma.position = String(body.position ?? "midline");
      return json(publicSigma(sigma));
    }
    if (request.method === "POST" && parsed.tail === "swap-set") {
      sigma.activeSet = String(body.set ?? (sigma.activeSet === "A" ? "B" : "A")).toUpperCase();
      return json(publicSigma(sigma));
    }
    if (request.method === "GET" && parsed.tail === "weapons") {
      return json({
        ok: true,
        login: sigma.login,
        weapons: sigma.weapons,
        activeWeapon: sigma.activeWeapon,
        maxSlots: weaponCatalog.maxSlots,
        combat: sigma.combat,
      });
    }
    if (request.method === "POST" && parsed.tail === "weapons") {
      const allowed = new Set(weaponCatalog.weapons.map((weapon) => weapon.id));
      sigma.weapons = Array.isArray(body.weapons)
        ? body.weapons
            .map(String)
            .filter((id) => allowed.has(id))
            .slice(0, weaponCatalog.maxSlots)
        : [];
      sigma.activeWeapon = sigma.weapons.includes(String(body.set))
        ? String(body.set)
        : (sigma.weapons[0] ?? null);
      return json({
        ok: true,
        login: sigma.login,
        weapons: sigma.weapons,
        activeWeapon: sigma.activeWeapon,
        maxSlots: weaponCatalog.maxSlots,
        combat: sigma.combat,
      });
    }

    return json({ ok: false, error: "unknown_mmo_endpoint", tail: parsed.tail }, 404);
  },
});

console.log(`[mock-mmo] listening on http://${HOST}:${PORT}`);
