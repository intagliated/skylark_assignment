# Decision Log — Monday.com BI Agent

## Key Assumptions

**Data structure**: The two CSV boards (Work Orders + Deals) have roughly normalized column names after import. Field discovery is done at runtime via `get_board_schema` tool, so the agent adapts to whatever column titles exist in the actual board — not hardcoded field names.

**"Live" means per-query**: Every user question triggers fresh Monday.com API calls. No data is cached between requests. The server is stateless; conversation history is passed in full with each request (standard LLM pattern).

**Messy data handling scope**: I focused on the most common real-world problems — null/empty values, inconsistent currency strings (`$1,234,567` vs `1234567`), inconsistent date formats (ISO, MM/DD/YYYY, native Date), and case-insensitive text matching for sectors/statuses. I log data quality caveats in the tool trace.

**Authentication**: The agent uses bearer token auth (`Authorization: <token>`) which is the Monday.com API v2 standard. API keys are entered in the UI and stored in localStorage, or set as Vercel env vars for zero-config evaluation.

---

## Architecture

**Stack**: Next.js 14 (App Router) + TypeScript, deployed to Vercel. The backend is a single serverless API route at `/api/chat`.

**Agent pattern**: Agentic loop with Claude claude-sonnet-4-20250514 as the orchestrator. Claude decides which tools to call, in what order, based on the user's question. The loop continues until `stop_reason === 'end_turn'` (max 10 iterations to prevent runaway loops).

**Tools designed**:
- `list_boards` — discover available boards
- `get_board_schema` — inspect columns before querying (avoids wrong field names)
- `query_board` — full-featured: fetch, normalize, filter, group, aggregate, sort
- `cross_board_analysis` — multi-board patterns (sector overlap, timeline correlation)

**Visibility**: Every tool call produces structured logs (`ApiCallLog[]`) returned alongside the agent's message. The frontend renders a collapsible "Tool Call Trace" panel under each agent response, showing exact API calls made, data retrieved, filters applied, and data quality warnings.

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| Client-side API keys (localStorage) | Easy evaluation, but not production-safe. For prod: use NextAuth + server-side secrets. |
| Single-file architecture (one API route) | Fast to iterate, but doesn't scale to streaming responses. Would use SSE/streaming for prod. |
| Claude as orchestrator (not hardcoded logic) | Flexible for any query shape, but adds latency per agentic iteration. Acceptable for BI use case. |
| Normalize all fields at query time | CPU-cheap, handles schema drift. Downside: inconsistent normalization across runs if column names change. |
| `items_page` (500 item limit) | Covers most real boards. Pagination cursor would be needed for boards >500 items. |

---

## What I'd Do With More Time

1. **Streaming responses**: Stream Claude's output token-by-token so the UI feels faster. Next.js supports SSE natively.

2. **Pagination**: Implement cursor-based pagination for large boards (>500 items).

3. **Chart rendering**: Parse structured data from agent responses and render Recharts/D3 charts inline. The agent already returns grouped stats — just needs a chart renderer.

4. **Caching schema**: Cache board column schemas (not item data) for 5 min to reduce API calls when the user asks multiple follow-up questions on the same board.

5. **Better date parsing**: Use `date-fns` more aggressively for edge cases like "Q3 2024", "last month", relative date expressions in user queries.

6. **Board auto-discovery**: Let the agent suggest which boards are likely Work Orders vs Deals based on column names, rather than requiring the user to know board IDs.

---

## Bonus: Leadership Updates

**Interpretation**: A "leadership update" is a structured summary prepared before a board meeting — typically covering pipeline health, top deals by stage, revenue forecast, blockers in work orders, and sector performance.

**Implementation approach** (if built): A `/leadership-update` button would trigger a multi-step agent run: (1) fetch both boards, (2) run sector breakdown cross-analysis, (3) compute pipeline stage funnel, (4) identify stalled/overdue work orders, (5) return a formatted markdown brief with an executive summary, key metrics table, and action items. Could be exported as PDF via `window.print()`.

This was not implemented in the submission but the agent's `cross_board_analysis` tool with `analysis_type: 'overview'` is the foundation for it.
