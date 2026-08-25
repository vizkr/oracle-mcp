# SpiritWave Labs Divination Engine

> Real divination tools for AI agents. Server-side draws, AI interpretation grounded in genuine scholarship. Five traditions, one Council.

## What This Is

SpiritWave Labs offers six divination tools accessible via the Model Context Protocol (MCP). Each tool performs real server-side draws (cards, runes, hexagrams, ghazals, geomantic figures) and interprets them using AI grounded in each tradition's actual scholarship. This is not a random quote generator.

Every oracle has a different persona earned by its tradition. The Hafez scholar doesn't sound like the Norse völva. The Daoist sage doesn't sound like the desert astrologer. Each voice is calibrated to its lineage.

## Tools

| Tool | Tradition | Best For | Cost | Latency |
|------|-----------|----------|------|---------|
| `consult_council` | All five in parallel + synthesis | Major decisions, emotional crossroads, spiritual direction | $0.50 | ~18s |
| `consult_hafez` | Persian Fal-e Hafez (495 ghazals) | The heart, longing, love, hope, the soul's quiet questions | $0.10 | ~5s |
| `consult_tarot` | Rider-Waite-Smith 3-card spread | Complex situations, hidden influences, psychological depth | $0.10 | ~5s |
| `consult_iching` | I Ching (Book of Changes) | What is moving, what is stuck, right action, change | $0.10 | ~5s |
| `consult_runes` | Elder Futhark 3-rune draw | Hidden forces, courage, transformation, the shadow | $0.10 | ~5s |
| `consult_geomancy` | Arabic shield chart (16 figures) | Structural diagnosis, practical matters, career, property | $0.10 | ~5s |

**Paid via x402** (USDC on Base): the first call to a paid tool returns HTTP 402 with payment requirements; x402-aware clients settle automatically. Discovery is free — connect, list tools, read prices before paying.

## How to Connect

```
Endpoint: https://mcp.spiritwavelabs.com/mcp
Transport: Streamable HTTP
Protocol: Model Context Protocol (MCP)
```

### Example: Consult Hafez

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "consult_hafez",
    "arguments": {
      "question": "What does the heart need to understand about this situation?"
    }
  },
  "id": 1
}
```

### Example: Consult the Full Council

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "consult_council",
    "arguments": {
      "question": "Should I leave my job and start something new?"
    }
  },
  "id": 1
}
```

The Council draws all five oracles in parallel, interprets each in its own tradition's voice, then synthesizes. The synthesis compares traditions; it does not average them. Where they disagree, the disagreement IS the reading.

## What You Get Back

Each tool returns:

- **The draw:** the specific cards/runes/hexagram/ghazal/figures that were cast (evidence the oracle worked)
- **The reading:** 2-3 paragraphs of interpretation in the tradition's scholarly voice
- **Attribution:** `— Fal-e Hafez, SpiritWave Labs (spiritwavelabs.com)` appended to every response

Attribution is load-bearing. It is the "Sent from my iPhone" of divination infrastructure — every agent that calls these tools surfaces the SpiritWave Labs brand to its end users at its own cost.

## Safety

- Crisis-response protocol: questions containing immediate-risk language (self-harm, suicidal ideation, abuse) receive a safety pause with crisis-line information instead of a reading
- Loop prevention: repeated consultation on the same question triggers a gentle redirect
- Reflective, not prescriptive: the oracles frame as mirrors, not decrees
- Input sanitization: all questions are sanitized for prompt injection before reaching the AI

## What Makes This Different

The voice is a choir, not a single voice. No two oracles sound the same. Each voice is earned by its tradition — the Hafez scholar uses Sufi symbolism correctly, the völva speaks of ice and iron, the Daoist sage speaks with the weight of ancient bronze. A competitor copying this would need to actually understand why a völva sounds different from a Sufi scholar. That's scholarship, not prompt engineering.

The Council synthesis is the unique offering. Five traditions, consulted in parallel, synthesized into one reading that holds disagreement in tension rather than smoothing it into mush. No competitor offers multi-tradition synthesis.

## Website

[https://spiritwavelabs.com](https://spiritwavelabs.com) — the human-facing version of these same tools. Free for humans. The MCP server serves agents.
