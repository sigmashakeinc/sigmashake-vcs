# VCS Integration Contracts

The public repository exposes contract docs and mocks for collaborators. The
production implementations live in the private stream stack.

## Bridge RPC

Worker to bridge:

```json
{"type":"rpc","req_id":"uuid","method":"GET","path":"/api/v1/vcs/me","body":{"source":"twitch","login":"devviewer"}}
```

Bridge to Worker:

```json
{"type":"rpc_reply","req_id":"uuid","status":200,"body":"{\"ok\":true}"}
```

## Cosmetic Routes

These routes proxy to chat-elixir in production and to `mock-chat` in the
public harness:

- `GET /api/v1/vcs/me`
- `GET /api/v1/vcs/catalog`
- `POST /api/v1/vcs/equip`
- `POST /api/v1/vcs/unequip`
- `POST /api/v1/vcs/buy`
- `POST /api/v1/vcs/color`
- `POST /api/v1/vcs/hue`
- `POST /api/v1/vcs/raw_slot`
- `POST /api/v1/vcs/body`
- `POST /api/v1/vcs/clear_body`
- `POST /api/v1/vcs/clear_raw_slot`

## Combat Routes

These routes proxy to Sigma Shake MMO in production and to `mock-mmo` in the
public harness:

- `GET /api/v1/vcs/combat-gear`
- `GET /api/v1/vcs/combat-loadout`
- `POST /api/v1/vcs/combat-equip`
- `GET /api/v1/vcs/combat-sigma`
- `GET /api/v1/vcs/combat-passive-tree`
- `POST /api/v1/vcs/combat-passives`
- `POST /api/v1/vcs/combat-reserve`
- `POST /api/v1/vcs/combat-position`
- `POST /api/v1/vcs/combat-swap-set`
- `GET /api/v1/vcs/combat-weapon-catalog`
- `GET /api/v1/vcs/combat-weapons`
- `POST /api/v1/vcs/combat-weapons`

Combat routes that require a character are Twitch-only. Non-Twitch sessions
should return a successful unavailable envelope:

```json
{"ok":true,"unavailable":true,"reason":"combat_twitch_only"}
```

