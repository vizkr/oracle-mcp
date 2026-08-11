/**
 * SpiritWave Labs — Pentamancy Council MCP Server
 *
 * Exposes the five-oracle Council (Hafez, Tarot, Runes, I Ching, Geomancy)
 * and the oracle router to AI agents via the Model Context Protocol.
 *
 * Architecture: thin proxy. This server receives MCP tool calls (tools/call),
 * forwards them to the existing SpiritWave Labs PHP API, and shapes the
 * response into MCP content/structuredContent.
 *
 * Transport: Streamable HTTP (the 2026-07-28 standard for remote servers).
 * Single endpoint: POST /mcp
 *
 * Payment: x402 layer added in Phase 2. Phase 1 is unpaid for testing.
 */

import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logToolCall } from "./analytics.js";

// ── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001", 10);

// The PHP API base URL. In production this is the live site; locally it can
// point to a dev server. The MCP server proxies to these endpoints.
const API_BASE = process.env.SWL_API_BASE || "https://spiritwavelabs.com";

// API key for bypassing human-side gating on temple.php.
// Must match SWL_MCP_API_KEY in config.php on the VPS.
const API_KEY = process.env.SWL_API_KEY || "";

// ── PHP API Proxy ──────────────────────────────────────────────────────────

interface CouncilResponse {
  question: string;
  council: {
    hafez: { draw: unknown; reading: string | null };
    tarot: { draw: unknown; reading: string | null };
    runes: { draw: unknown; reading: string | null };
    iching: { draw: unknown; reading: string | null };
    geomancy: { draw: unknown; reading: string | null };
  };
  synthesis: string;
  attribution: string;
  silent?: string[];
}

interface OracleRouterResponse {
  tool: string;
  name: string;
  path: string;
  label: string;
  reason: string;
  cta: string;
  secondary?: { tool: string; name: string; path: string; note: string } | null;
}

/**
 * Call the Council endpoint (temple.php).
 * Draws all five oracles server-side and returns the synthesis.
 */
async function consultCouncil(question: string): Promise<CouncilResponse> {
  const res = await fetch(`${API_BASE}/api/temple.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SWL-API-Key": API_KEY,
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Council API returned ${res.status}: ${body.slice(0, 200)}`
    );
  }

  return (await res.json()) as CouncilResponse;
}

/**
 * Call a single oracle via temple.php (single_oracle mode).
 * Draws and interprets just one oracle. Returns the reading.
 */
interface SingleOracleResponse {
  oracle: string;
  name: string;
  question: string;
  draw: unknown;
  reading: string;
  attribution: string;
}

async function consultSingleOracle(
  oracle: string,
  question: string
): Promise<SingleOracleResponse> {
  const res = await fetch(`${API_BASE}/api/temple.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SWL-API-Key": API_KEY,
    },
    body: JSON.stringify({ question, single_oracle: oracle }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Oracle API (${oracle}) returned ${res.status}: ${body.slice(0, 200)}`
    );
  }

  return (await res.json()) as SingleOracleResponse;
}

/**
 * Call the oracle router endpoint.
 * Returns a recommendation for which oracle best fits the question.
 */
async function recommendOracle(
  question: string
): Promise<OracleRouterResponse> {
  const res = await fetch(`${API_BASE}/api/oracle-router.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SWL-API-Key": API_KEY,
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Oracle router returned ${res.status}: ${body.slice(0, 200)}`
    );
  }

  return (await res.json()) as OracleRouterResponse;
}

// ── MCP Server Setup ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "spiritwavelabs-council",
  version: "1.0.0",
});

// ── Tool: consult_council ──────────────────────────────────────────────────

server.registerTool(
  "consult_council",
  {
    title: "Pentamancy Council Reading",
    description:
      "Consult the Pentamancy Council — five ancient oracles (Hafez, Tarot, Runes, I Ching, Geomancy) consulted in parallel and synthesized into a single unified reading. Use this when someone needs deep, multi-perspective guidance on a question. The council draws all five oracles server-side, interprets each, then synthesizes. Best for questions of substance: major decisions, emotional crossroads, spiritual direction. Not for trivial yes/no questions. Cost: $0.50 per call (free during launch period).",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(1000)
        .describe(
          "The question to consult the council about. Should be a genuine question needing guidance — e.g. 'Should I change careers?' or 'What do I need to understand about this relationship?' Avoid yes/no questions; the council works best with open questions seeking insight."
        ),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await consultCouncil(question);
      const durationMs = Date.now() - startTime;

      // Log to analytics before returning (awaited so it completes)
      await logToolCall("consult_council", question.length, durationMs, false, question);

      // Build a readable text summary for the agent
      const lines: string[] = [];
      lines.push(`**Pentamancy Council Reading**`);
      lines.push(``);
      lines.push(`**Question:** ${result.question}`);
      lines.push(``);
      lines.push(`**Synthesis:**`);
      lines.push(result.synthesis);
      lines.push(``);

      if (result.silent && result.silent.length > 0) {
        lines.push(
          `*Silent oracles: ${result.silent.join(", ")}*`
        );
        lines.push(``);
      }

      // Include individual oracle readings for the agent to reference
      for (const [name, oracle] of Object.entries(result.council)) {
        if (oracle.reading) {
          lines.push(`**${name.charAt(0).toUpperCase() + name.slice(1)}:** ${oracle.reading}`);
          lines.push(``);
        }
      }

      lines.push(result.attribution);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Council consultation failed: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: recommend_oracle ─────────────────────────────────────────────────

server.registerTool(
  "recommend_oracle",
  {
    title: "Oracle Recommender",
    description:
      "Recommend which divination oracle best fits a question. Returns a routing decision with the recommended tool and reasoning. Free tool — use this to help decide which oracle tradition is most appropriate before consulting. Returns: tool name, path, reason, and a call-to-action phrase.",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(500)
        .describe("The question to find the best oracle for."),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await recommendOracle(question);
      const durationMs = Date.now() - startTime;

      // Log to analytics before returning (awaited so it completes)
      await logToolCall("recommend_oracle", question.length, durationMs, false, question);

      const text = [
        `**Recommended Oracle: ${result.name}**`,
        ``,
        result.reason,
        ``,
        `*${result.cta}*`,
      ];

      if (result.secondary) {
        text.push(``);
        text.push(`**Alternative: ${result.secondary.name}** — ${result.secondary.note}`);
      }

      return {
        content: [{ type: "text", text: text.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text", text: `Oracle recommendation failed: ${message}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: consult_hafez ────────────────────────────────────────────────────

server.registerTool(
  "consult_hafez",
  {
    title: "Fal-e Hafez Reading",
    description:
      "Consult Fal-e Hafez — the Persian practice of divination through the poetry of Hafez of Shiraz. Draws a random ghazal from the Divan and interprets it in the voice of a Sufi scholar. Best for questions of the heart, longing, love, hope, and the soul's quiet questions. The oldest and most-used oracle on SpiritWave Labs. Cost: $0.05 per call (free during launch period).",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(1000)
        .describe("The question to consult Hafez about."),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await consultSingleOracle("hafez", question);
      const durationMs = Date.now() - startTime;
      await logToolCall("consult_hafez", question.length, durationMs, false, question);
      const text = [
        `**Fal-e Hafez Reading**`,
        ``,
        `**Question:** ${result.question}`,
        ``,
        result.reading,
        ``,
        result.attribution,
      ];
      return {
        content: [{ type: "text", text: text.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Hafez consultation failed: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: consult_tarot ────────────────────────────────────────────────────

server.registerTool(
  "consult_tarot",
  {
    title: "Tarot Reading",
    description:
      "Consult the Tarot — a three-card Past/Present/Future spread from the Rider-Waite-Smith deck (1909). Interpreted in the Waite tradition with scholarly grounding. Best for complex situations with many moving parts, hidden influences, and psychological depth. Includes crisis-response safety boundaries. Cost: $0.05 per call (free during launch period).",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(1000)
        .describe("The question to consult the Tarot about."),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await consultSingleOracle("tarot", question);
      const durationMs = Date.now() - startTime;
      await logToolCall("consult_tarot", question.length, durationMs, false, question);
      const text = [
        `**Tarot Reading**`,
        ``,
        `**Question:** ${result.question}`,
        ``,
        result.reading,
        ``,
        result.attribution,
      ];
      return {
        content: [{ type: "text", text: text.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Tarot consultation failed: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: consult_iching ───────────────────────────────────────────────────

server.registerTool(
  "consult_iching",
  {
    title: "I Ching Reading",
    description:
      "Consult the I Ching (Book of Changes) — the oldest continuously used divination text in the world, over 3,000 years old. Casts a hexagram and interprets it in the voice of a Daoist sage. Best for the dynamics of a situation — what is moving, what is stuck, the right action at the right time, change and transition. Cost: $0.05 per call (free during launch period).",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(1000)
        .describe("The question to consult the I Ching about."),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await consultSingleOracle("iching", question);
      const durationMs = Date.now() - startTime;
      await logToolCall("consult_iching", question.length, durationMs, false, question);
      const text = [
        `**I Ching Reading**`,
        ``,
        `**Question:** ${result.question}`,
        ``,
        result.reading,
        ``,
        result.attribution,
      ];
      return {
        content: [{ type: "text", text: text.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `I Ching consultation failed: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: consult_runes ────────────────────────────────────────────────────

server.registerTool(
  "consult_runes",
  {
    title: "Rune Reading",
    description:
      "Consult the Runes — a three-rune draw (Urd/Verdandi/Skuld = Past/Present/Future) from the Elder Futhark. Interpreted in the voice of a Norse völva (seeress). Best for the hidden force at work, what drives the situation beneath the surface, courage, transformation, and the shadow. The voice is terse, grounded, and offers no modern comfort. Cost: $0.05 per call (free during launch period).",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(1000)
        .describe("The question to consult the Runes about."),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await consultSingleOracle("runes", question);
      const durationMs = Date.now() - startTime;
      await logToolCall("consult_runes", question.length, durationMs, false, question);
      const text = [
        `**Rune Reading**`,
        ``,
        `**Question:** ${result.question}`,
        ``,
        result.reading,
        ``,
        result.attribution,
      ];
      return {
        content: [{ type: "text", text: text.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Rune consultation failed: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: consult_geomancy ─────────────────────────────────────────────────

server.registerTool(
  "consult_geomancy",
  {
    title: "Geomancy Reading",
    description:
      "Consult Geomancy ('Ilm al-Raml, the Arabic Science of Sand) — casts a full 16-figure shield chart and interprets it. The oldest continuous Western divination tradition. Best for where the problem actually lies, structural diagnosis, practical matters, career, money, property, and health. Cost: $0.05 per call (free during launch period).",
    inputSchema: {
      question: z
        .string()
        .min(3)
        .max(1000)
        .describe("The question to consult Geomancy about."),
    },
  },
  async ({ question }) => {
    const startTime = Date.now();
    try {
      const result = await consultSingleOracle("geomancy", question);
      const durationMs = Date.now() - startTime;
      await logToolCall("consult_geomancy", question.length, durationMs, false, question);
      const text = [
        `**Geomancy Reading**`,
        ``,
        `**Question:** ${result.question}`,
        ``,
        result.reading,
        ``,
        result.attribution,
      ];
      return {
        content: [{ type: "text", text: text.join("\n") }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Geomancy consultation failed: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── HTTP Server (Streamable HTTP transport) ────────────────────────────────

const app = express();
app.use(express.json());

// Health check endpoint (for monitoring / UptimeRobot)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "spiritwavelabs-council",
    version: "1.0.0",
    api_base: API_BASE,
    timestamp: new Date().toISOString(),
  });
});

// MCP endpoint — Streamable HTTP transport
app.post("/mcp", async (req, res) => {
  try {
    // Create a fresh transport per request (stateless, per 2026-07-28 spec).
    // The McpServer is connected to this transport for the duration of the request.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Wire the server to this transport
    await server.connect(transport);

    // Handle the request — this dispatches to the registered tool handlers
    await transport.handleRequest(req, res, req.body);

    // Clean up — close the transport but NOT the server (singleton, must stay alive)
    res.on("close", () => {
      transport.close();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[MCP] Request handling error:", message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: (req.body as { id?: unknown })?.id ?? null,
      });
    }
  }
});

// Reject non-POST to /mcp (the spec uses POST for all JSON-RPC)
app.use("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. Use POST." });
});

// Root — basic info
app.get("/", (_req, res) => {
  res.json({
    name: "SpiritWave Labs Pentamancy Council MCP Server",
    version: "1.0.0",
    mcp_endpoint: "/mcp",
    health: "/health",
    description:
      "Five-oracle divination council (Hafez, Tarot, Runes, I Ching, Geomancy) for AI agents.",
    website: "https://spiritwavelabs.com",
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[SpiritWave Labs MCP] Server running on port ${PORT}`);
  console.log(`[SpiritWave Labs MCP] MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`[SpiritWave Labs MCP] Health check: http://localhost:${PORT}/health`);
  console.log(`[SpiritWave Labs MCP] API base: ${API_BASE}`);
  console.log(`[SpiritWave Labs MCP] Tools: consult_council, recommend_oracle, consult_hafez, consult_tarot, consult_iching, consult_runes, consult_geomancy`);
});
