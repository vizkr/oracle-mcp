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

// ── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001", 10);

// The PHP API base URL. In production this is the live site; locally it can
// point to a dev server. The MCP server proxies to these endpoints.
const API_BASE = process.env.SWL_API_BASE || "https://spiritwavelabs.com";

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
    headers: { "Content-Type": "application/json" },
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
 * Call the oracle router endpoint.
 * Returns a recommendation for which oracle best fits the question.
 */
async function recommendOracle(
  question: string
): Promise<OracleRouterResponse> {
  const res = await fetch(`${API_BASE}/api/oracle-router.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
      "Consult the Pentamancy Council — five ancient oracles (Hafez, Tarot, Runes, I Ching, Geomancy) consulted in parallel and synthesized into a single unified reading. Use this when someone needs deep, multi-perspective guidance on a question. The council draws all five oracles server-side, interprets each, then synthesizes. Best for questions of substance: major decisions, emotional crossroads, spiritual direction. Not for trivial yes/no questions.",
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
    try {
      const result = await consultCouncil(question);

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
    try {
      const result = await recommendOracle(question);

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
  // Check for the required MCP protocol version header
  const protocolVersion =
    req.headers["mcp-protocol-version"] as string | undefined;

  // Each request gets its own transport + server connection (stateless, per 2026-07-28)
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    await server.connect(transport);

    // Let the transport handle the request
    await transport.handleRequest(req, res, req.body);

    // Clean up after the response is sent
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
  console.log(`[SpiritWave Labs MCP] Tools: consult_council, recommend_oracle`);
});
