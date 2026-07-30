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

### `recommend_oracle`
Recommends which divination tradition best fits a question. Free tool — returns a routing decision with reasoning. Useful when an agent needs to decide which oracle to consult.

**Input:** `{ question: string }` (3–500 chars)

## Architecture

This is a **thin proxy**. The MCP server receives JSON-RPC tool calls and forwards them to the existing SpiritWave Labs PHP API:

```
Agent → MCP server (this repo, Streamable HTTP) → PHP API (temple.php, oracle-router.php) → DeepSeek
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

- **Phase 1 (current):** MCP scaffold with two tools, no payment. Testable locally.
- **Phase 1b:** Deploy to `mcp.spiritwavelabs.com`, Nginx reverse proxy, PM2 process manager.
- **Phase 2:** x402 payment layer — per-call USDC payment via Coinbase CDP facilitator (Base network). Agents pay per Council reading.
- **Phase 3:** Registry listing — official MCP Registry, Smithery, Glama.

## License

MIT © SpiritWave Labs
