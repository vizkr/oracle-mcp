/**
 * x402 paywall for the Oracle MCP — per-tool pricing on tools/call only.
 *
 * Design (Peter's rulings, 2026-08-25):
 *   - $0.50 council, $0.10 individual oracles, paid from day one.
 *   - initialize / tools/list / notifications stay FREE — agents must be able
 *     to connect, discover, and read prices before they pay. Payment gates
 *     only the tool call itself.
 *   - Facilitator: x402 Foundation public facilitator (verify + settle, free
 *     verification). Payee: SpiritWave Labs Base USDC wallet.
 *
 * Flow (x402 v1 spec):
 *   1. Agent POSTs tools/call without payment → 402 + paymentRequirements
 *   2. Agent signs EIP-3009 transferWithAuthorization (USDC on Base),
 *      retries with X-PAYMENT header (base64url JSON payload)
 *   3. We POST the payload to the facilitator /verify, then /settle
 *   4. On success we forward the call and return X-PAYMENT-RESPONSE (receipt)
 */

import type { Request, Response, NextFunction } from "express";

// ── Config ──────────────────────────────────────────────────────────────────

const PAYEE_ADDRESS =
  process.env.X402_PAYEE ?? "0x13d07Ab3bD1B404bFEFCA8835A9A702022C3dbde";
const FACILITATOR_URL =
  process.env.X402_FACILITATOR ?? "https://x402.org/facilitator";
const X402_ENABLED = (process.env.X402_ENABLED ?? "true") !== "false";
const BASE_CHAIN_ID = "eip155:8453";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // native USDC on Base
const USDC_DECIMALS = 6;
const RESOURCE_URL = process.env.X402_RESOURCE ?? "https://mcp.spiritwavelabs.com/mcp";

// ── Pricing (dollars; converted to atomic units per call) ───────────────────

const PRICES: Record<string, number> = {
  consult_council: 0.5,
  consult_hafez: 0.1,
  consult_tarot: 0.1,
  consult_iching: 0.1,
  consult_runes: 0.1,
  consult_geomancy: 0.1,
};

function toAtomic(usd: number): string {
  return String(BigInt(Math.round(usd * 1_000_000)));
}

// ── Payment requirements (x402 v1 shape) ────────────────────────────────────

interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

function requirementsFor(tool: string, priceUsd: number): PaymentRequirements {
  return {
    scheme: "exact",
    network: BASE_CHAIN_ID,
    maxAmountRequired: toAtomic(priceUsd),
    resource: RESOURCE_URL,
    description: `SpiritWave Labs — ${tool} reading for an AI agent`,
    mimeType: "application/json",
    payTo: PAYEE_ADDRESS,
    asset: USDC_BASE,
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  };
}

// ── Facilitator calls ───────────────────────────────────────────────────────

interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: Record<string, unknown>;
}

function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    // Header may be plain base64url JSON or raw JSON — accept both.
    const trimmed = header.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed) as PaymentPayload;
    const b64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as PaymentPayload;
  } catch {
    return null;
  }
}

async function facilitator(
  op: "verify" | "settle",
  payment: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<{ ok: boolean; detail?: string; receipt?: unknown }> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: payment.payload,
        paymentRequirements: requirements,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, detail: `facilitator ${op} HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}` };
    }
    if (op === "verify") {
      const isValid = body.isValid !== false;
      return { ok: isValid, detail: isValid ? undefined : JSON.stringify(body).slice(0, 300) };
    }
    // settle: success carries transaction/network; some facilitators return {success:false}
    const failed = body.success === false || body.transaction === undefined;
    return {
      ok: !failed,
      detail: failed ? JSON.stringify(body).slice(0, 300) : undefined,
      receipt: body,
    };
  } catch (err) {
    return { ok: false, detail: `facilitator ${op} unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Replay cache (payment payloads are single-use) ──────────────────────────

const seenPayments = new Map<string, number>();
const REPLAY_TTL_MS = 10 * 60 * 1000;

function isReplay(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of seenPayments) if (now - t > REPLAY_TTL_MS) seenPayments.delete(k);
  if (seenPayments.has(key)) return true;
  seenPayments.set(key, now);
  return false;
}

// ── Middleware ──────────────────────────────────────────────────────────────

function respond402(res: Response, tool: string, priceUsd: number, why: string) {
  res.status(402).json({
    x402Version: 1,
    error: why,
    paymentRequirements: [requirementsFor(tool, priceUsd)],
  });
}

/**
 * Express middleware: buffers the JSON-RPC body, decides whether the call is
 * a paid tool invocation, and either demands/verifies payment or passes
 * through. Free methods: initialize, notifications/*, tools/list, ping,
 * resources/*, prompts/* — everything except paid tools/call.
 */
export function x402Paywall(req: Request, res: Response, next: NextFunction): void {
  if (!X402_ENABLED) return next();

  // express.json() (mounted earlier) usually has already parsed the body.
  // Only buffer manually when it hasn't (no/other content-type).
  const bodyAlreadyParsed =
    req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0;

  if (bodyAlreadyParsed) {
    return void handleRoute(req, res, next);
  }

  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk: string) => (raw += chunk));
  req.on("error", () => respond402(res, "consult_council", PRICES["consult_council"], "Malformed request"));
  req.on("end", () => {
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    void handleRoute(req, res, next);
  });
}

async function handleRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!X402_ENABLED) return next();

    let method = "";
    let toolName = "";
    let id: unknown = null;

    const msg = Array.isArray(req.body) ? req.body[0] : req.body;
    if (msg && typeof msg === "object") {
      method = String((msg as Record<string, unknown>).method ?? "");
      id = (msg as Record<string, unknown>).id ?? null;
      const params = (msg as Record<string, unknown>).params as Record<string, unknown> | undefined;
      toolName = params && typeof params.name === "string" ? params.name : "";
    }

    // Only tools/call on a priced tool costs anything.
    const isPaidCall = method === "tools/call" && toolName in PRICES;
    if (!isPaidCall) return next();

    const priceUsd = PRICES[toolName];

    // Batched requests containing paid calls: demand payment for the highest
    // priced tool in the batch. Rare in MCP clients; handled conservatively.
    if (Array.isArray(req.body)) {
      const tools = req.body
        .map((m: Record<string, unknown>) => {
          const p = m.params as Record<string, unknown> | undefined;
          return p && typeof p.name === "string" ? p.name : "";
        })
        .filter((n: string) => n in PRICES) as string[];
      const top = tools.sort((a: string, b: string) => PRICES[b] - PRICES[a])[0];
      if (top && top !== toolName) {
        return respond402(res, top, PRICES[top], `Batch contains paid tool calls; pay for ${top}`);
      }
    }

    const header =
      (req.headers["x-payment"] as string | undefined) ??
      (req.headers["payment"] as string | undefined);

    if (!header) {
      return respond402(res, toolName, priceUsd, `X-PAYMENT header is required for ${toolName} ($${priceUsd.toFixed(2)} USDC on Base)`);
    }

    const payment = decodePaymentHeader(header);
    if (!payment || !payment.payload) {
      return respond402(res, toolName, priceUsd, "X-PAYMENT header is not a valid x402 payment payload");
    }

    // Cheap replay guard on the signature before hitting the facilitator.
    const sigKey = JSON.stringify(payment.payload).slice(0, 512);
    if (isReplay(sigKey)) {
      return respond402(res, toolName, priceUsd, "Payment already used");
    }

    const requirements = requirementsFor(toolName, priceUsd);

    const verified = await facilitator("verify", payment, requirements);
    if (!verified.ok) {
      return respond402(res, toolName, priceUsd, `Payment verification failed: ${verified.detail ?? "invalid"}`);
    }

    const settled = await facilitator("settle", payment, requirements);
    if (!settled.ok) {
      return respond402(res, toolName, priceUsd, `Payment settlement failed: ${settled.detail ?? "invalid"}`);
    }

    // Settlement receipt back to the client per spec.
    const receiptB64 = Buffer.from(JSON.stringify(settled.receipt ?? {})).toString("base64");
    res.setHeader("X-PAYMENT-RESPONSE", receiptB64);

    return next();
}
