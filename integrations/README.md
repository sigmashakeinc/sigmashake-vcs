# sigmashake-vcs Integration Harness

This directory contains the public, secret-free harness for contributors who
need to work on the full OBS-stream path without private SigmaShake services.

## Pieces

- `mock-chat/server.js` implements the chat-elixir VCS cosmetic endpoints on
  `http://127.0.0.1:8081`.
- `mock-mmo/server.js` implements the MMO combat endpoints on
  `http://127.0.0.1:7777`.
- `bridge/vcs-bridge.js` connects to the Worker WebSocket at `/ws/streamer`
  and proxies RPCs to the two mocks.
- `mock-auth/` documents local session fixtures for the Worker cookie path.
- `contracts/` documents the route split and payload expectations.

## Run

Start these in separate terminals:

```sh
bun run integration:mock-chat
bun run integration:mock-mmo
VCS_BASE_URL=http://127.0.0.1:8787 VCS_HMAC_KEY=dev-vcs-secret bun run integration:bridge
bun run dev
```

The bridge key must match the Worker's local `VCS_HMAC_KEY`.

## What This Does Not Publish

The harness does not include private OBS scene code, production chat-elixir
schemas, production MMO persistence, real account OAuth clients, Cloudflare
namespace IDs, or stream operator secrets. It only publishes enough source to
let collaborators add features against stable contracts.

