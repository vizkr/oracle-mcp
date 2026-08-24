# SpiritWave Labs — Pentamancy Council MCP Server

Exposes the [SpiritWave Labs](https://spiritwavelabs.com) Pentamancy Council (five-oracle divination engine) to AI agents via the Model Context Protocol.

## Tools

### `consult_council`
Consults five ancient oracles in parallel and synthesizes their readings into a single unified counsel:
- **Hafez** — Persian Sufi poetry (Fal-e Hafez)
- **Tarot** — Rider-Waite 78-card deck, 3-card spread
- **Runes** — Elder Futhark, 3-rune draw
- **I Ching** — Book of Changes, coin-cast hexagram
- **Geomancy** — Arabic `Ilm al-Raml, shield chart

The server draws all five, interprets each, then synthesizes. Best for questions of substance — major decisions, emotional crossroads, spiritual direction.

**Input:** `{ question: string }` (3–1000 chars)

### Individual consultations
`consult_hafez`, `consult_tarot`, `consult_iching`, `consult_runes`, `consult_geomancy` — each draws its own tradition server-side and interprets it in that tradition's voice. The tool descriptions are written so agents route themselves; there is deliberately no router tool.

## Payments (x402)

Paid from day one. **$0.50 per Council reading, $0.10 per individual oracle**, in USDC on Base via the [x402 protocol](https://x402.org):

- `initialize`, `tools/list`, notifications — **free**. Connect, discover, read the prices.
- `tools/call` on a paid tool without payment → **HTTP 402** with `paymentRequirements` in the body (scheme `exact`, payee address, atomic amount).
- Retry with the `X-PAYMENT` header (signed EIP-3009 payload); the [x402 Foundation facilitator](https://x402.org/facilitator) verifies and settles, the call proceeds, and the settlement receipt returns in `X-PAYMENT-RESPONSE`.

Agents using `x402-fetch` (or any x402-aware client) get this flow automatically. Configuration: `X402_PAYEE`, `X402_FACILITATOR`, `X402_ENABLED` (see `docker-compose.yml`).

## Architecture

This is a **thin proxy**. The MCP server receives JSON-RPC tool calls and forwards them to the existing SpiritWave Labs PHP API:

```
Agent → MCP server (this repo, Streamable HTTP) → PHP API (temple.php, individual oracle endpoints) → DeepSeek
```

The divination engine lives entirely in the PHP backend. This server adds the MCP protocol layer — it does not implement any divination logic itself.

## Transport

Streamable HTTP (the MCP standard for remote servers). Single endpoint: `POST /mcp`.

## Setup

```bash
npm install
npm run build     # compile TypeScript
npm start         # run the compiled server
# or for development:
npm run dev       # run via tsx with hot reload
```

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `SWL_API_BASE` | `https://spiritwavelabs.com` | The PHP API base URL to proxy to |

## Roadmap

- **Phase 1 (done):** MCP scaffold, six tools, deployed at `mcp.spiritwavelabs.com` (Docker, behind nginx, healthy since 2026-08-18).
- **Phase 2:** x402 payment layer — per-call USDC payment via Coinbase CDP facilitator (Base network). Agents pay per reading.
- **Phase 3:** Registry listing — official MCP Registry, Smithery, Glama.

## License

MIT © SpiritWave Labs
