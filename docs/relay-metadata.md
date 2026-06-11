# Playlink Relay Metadata Notes

This document explores future relay metadata without adding relay runtime behavior.

It complements `docs/v0.7-relay-groundwork-plan.md` and should remain design-only until a concrete client or prototype needs these fields.

## 1. Purpose

Relay metadata should help clients and tools understand available connection paths.

It should not imply that Playlink currently runs a production relay service.

Potential future use cases:

- Web Console can display whether relay support is configured.
- SDK examples can choose between direct and relay endpoints explicitly.
- LAN/host demos can explain why relay is unavailable.
- Future relay prototypes can advertise local loopback endpoints for testing.

## 2. Current Metadata Baseline

`GET /api/server` currently exposes:

```json
{
  "server_id": "playlink:Playlink Server:dedicated:0.0.0.0:7777",
  "name": "Playlink Server",
  "version": "0.1.0",
  "topology": "dedicated",
  "bind_addr": "0.0.0.0:7777",
  "websocket_path": "/ws",
  "http_url": null,
  "ws_url": null,
  "public_http_url": null,
  "public_ws_url": null,
  "discovery": {
    "enabled": false,
    "method": null,
    "port": 7778
  }
}
```

This is enough for direct dedicated/host/LAN flows.

## 3. Design Principles

Relay metadata should be:

- additive
- optional
- explicit
- inspectable
- safe to ignore by old clients
- separate from room lifecycle payloads

Relay metadata should not:

- change `create_room`, `join_room`, `leave_room`, `room_message`, or `ping`
- require accounts
- imply global matchmaking
- require production relay infrastructure
- hide endpoint selection behind magic behavior

## 4. Candidate Shape

A future additive field could look like:

```json
{
  "relay": {
    "enabled": false,
    "mode": null,
    "public_ws_url": null,
    "description": null
  }
}
```

Field notes:

| Field | Meaning |
| --- | --- |
| `enabled` | Whether this server advertises any relay capability. |
| `mode` | Future string such as `forwarder`, `host_bridge`, or `room_authority`. |
| `public_ws_url` | Future WebSocket endpoint clients may explicitly choose. |
| `description` | Human-readable debug text for Web Console and examples. |

Do not add this shape to Rust code until a real prototype or SDK behavior needs it.

## 5. Capability List Alternative

Instead of a dedicated `relay` object, `/api/server` could eventually expose capabilities:

```json
{
  "capabilities": [
    "direct_websocket",
    "lan_discovery"
  ]
}
```

Future values might include:

```text
relay_forwarder
relay_host_bridge
state_sync_conventions
```

Pros:

- simple for clients to inspect
- avoids implying a full relay config too early
- easy to extend

Cons:

- less descriptive than a structured relay object
- may require additional endpoint metadata anyway

## 6. SDK Endpoint Selection

The JavaScript helper should continue to accept explicit URLs:

```js
const client = new PlaylinkClient({
  httpUrl: 'http://localhost:7777',
  wsUrl: 'ws://localhost:7777/ws',
});
```

Future endpoint selection should be explicit:

```js
const server = await client.serverInfo();
const wsUrl = server.relay?.enabled
  ? server.relay.public_ws_url
  : server.public_ws_url ?? server.ws_url;
```

Avoid automatic global lookup or account-based relay selection in the early framework.

## 7. Web Console Display

Future Web Console relay display could show:

```text
Relay: disabled
Mode: -
Relay WebSocket: -
```

If enabled in a prototype:

```text
Relay: enabled
Mode: host_bridge
Relay WebSocket: ws://relay.local:7779/ws
```

This should be read-only debug metadata, not a production admin control panel.

## 8. When to Add Code

Add relay metadata code only when all are true:

- the field has a documented client or console use
- direct WebSocket behavior remains unchanged
- old clients can ignore the field
- tests cover serialization and defaults
- README/docs can explain it simply

Likely first code task when ready:

```text
Add RelayConfig with enabled=false default and expose it under /api/server.
```

But this should wait until a concrete v0.7 follow-up task chooses it.

## 9. Non-Goals

This document does not design:

- relay routing
- NAT traversal
- global server registry
- authentication
- billing/quotas
- deployment infrastructure
- anti-cheat
- matchmaking

## 10. Open Questions

- Should relay be a `Topology` value or separate metadata?
- Is a capability list enough for the next prototype?
- Should relay endpoint selection live in docs, SDK helper utilities, or Web Console UI first?
- How should a host behind NAT establish its outbound relay session?
- Can a local loopback relay prototype prove value without external infrastructure?
