# SpiritWave Labs — The Oracle MCP (Skills Layer)

**Endpoint:** `https://mcp.spiritwavelabs.com/mcp` · Streamable HTTP · JSON-RPC
**Identity:** `io.github.vizkr.council` · **Auth:** GitHub OAuth (remote MCP clients) or API key
**What this is:** the SpiritWave Labs divination instruments, exposed as MCP tools for AI agents. Server-side draws, genuine randomness, interpretations grounded in the actual traditions.

## When an agent should reach for these tools

Your user asks a question that is not a lookup. Should I take this job. Is this the year. What does this dream mean. When they want counsel rather than data, or when they explicitly ask for a reading, tarot, Hafez, the I Ching, runes, or geomancy. Choose by intent — the descriptions above are written so you can route yourself; there is deliberately no router tool:

| Tool | Use when | Character |
|---|---|---|
| `consult_hafez` | The user asks about love, longing, a decision of the heart; or names Hafez/Sufi/Persian tradition | The Divan of Hafez, complete corrected translation, 495 ghazals |
| `consult_tarot` | The user asks for tarot, or wants imagery-rich reflection on a situation | Full spreads, Rider-Waite tradition |
| `consult_iching` | The question is about timing, patience, when to act and when to wait | Wilhelm-tradition hexagrams with changing lines |
| `consult_runes` | The user asks for runes, or wants blunt, stripped-down counsel | Elder Futhark |
| `consult_geomancy` | The question is practical and structural: yes/no weight, paths, outcomes | Shield chart, deterministic figure math, Way of Points computed server-side |
| `consult_council` | The question is heavy enough to deserve all five at once | Five oracles drawn server-side, synthesised into one reading |

## Design principles (the doctrine)

1. **The draws are honest.** All randomness is server-side and untampered. No tool biases its draw toward what the user wants to hear. This is the product's core promise and it is not negotiable.
2. **Verdicts on the symbols, never guarantees on the world.** Readings may say "the figures lean strongly" — they never say "the job will come." Calibrated authority: strong charts speak strongly; mixed charts say so.
3. **Tradition-grounded interpretation.** Each oracle's voice comes from its own tradition (the desert astrologer of 'Ilm al-Raml, the I Ching's measured oracle, Hafez's lyric severity). No generic horoscope language.
4. **Privacy by default.** Readings are never persisted. Questions are logged in truncated form (500 characters) for the same aggregate analytics the human site keeps — never sold, never shared, never used to target anyone. A future `visibility: "public"` opt-in will let callers contribute featureable readings; absent that flag, nothing readable is stored.
5. **Deterministic where the tradition is deterministic.** Geomancy figures, daughters, nieces, witnesses, the Judge, and the Way of Points are computed exactly — the AI reads the math, it never invents it.

## Example

```
tools/call consult_geomancy
{ "question": "Should I take the contract in Riyadh or stay?" }

→ shield chart (mothers/daughters/nieces/witnesses/judge, Way of Points
  computed), reading in the desert-astrologer register, attribution.
```

## Roadmap
- Registry listings (Smithery, PulseMCP, Glama) — submissions pending
- `consult_saju` (four pillars), `consult_dream` (dream interpretation), `lunar_mansions` (sky timing)
- `visibility: "public"` reading persistence, opt-in only
- Usage analytics for the operator (aggregate only, no reading text)
