# Mock Auth

The Worker authenticates viewer endpoints with a `session_id` cookie and a
matching `session:<id>` JSON record in the `SESSIONS` KV namespace. In local
development, leave `ENCRYPTION_KEY` unset and seed the fixture below as plain
JSON.

Example local KV seed:

```sh
wrangler kv key put --local --binding SESSIONS session:dev-session \
  "$(cat integrations/mock-auth/session-fixture.json)"
```

Then request the Worker with:

```sh
curl -H 'Cookie: session_id=dev-session' http://127.0.0.1:8787/api/v1/vcs/whoami
```

Production sessions are written by `sigmashake-accounts`; public
contributors should not need account-service source to work on VCS features.

