# Monday.com BI Agent

An AI-powered Business Intelligence agent that answers founder-level questions by querying live Monday.com board data.

## Live Demo

**Agent**: [Your Vercel URL here]  
**Monday.com Board**: [Your Monday.com shareable board link here]

> The agent queries Monday.com live for every question — no cached data.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (Next.js)              │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │  Chat UI     │    │  Tool Call Trace Panel │  │
│  │  (page.tsx)  │    │  (collapsible logs)    │  │
│  └──────┬───────┘    └───────────────────────┘  │
└─────────┼───────────────────────────────────────┘
          │ POST /api/chat
          ▼
┌─────────────────────────────────────────────────┐
│              Next.js API Route                   │
│  ┌──────────────────────────────────────────┐   │
│  │  Agentic Loop (route.ts)                 │   │
│  │  Claude claude-sonnet-4-20250514 orchestrates │   │
│  │  tool calls until end_turn               │   │
│  └──────────────┬───────────────────────────┘   │
│                 │ tool calls                      │
│  ┌──────────────▼───────────────────────────┐   │
│  │  Tool Executor (tools.ts)                │   │
│  │  - list_boards                           │   │
│  │  - get_board_schema                      │   │
│  │  - query_board (filter/group/aggregate)  │   │
│  │  - cross_board_analysis                  │   │
│  └──────────────┬───────────────────────────┘   │
└─────────────────┼───────────────────────────────┘
                  │ GraphQL queries
                  ▼
┌─────────────────────────────────────────────────┐
│           Monday.com API v2                      │
│    https://api.monday.com/v2                     │
│    (Work Orders Board + Deals Board)             │
└─────────────────────────────────────────────────┘
```

---

## Setup

### Prerequisites
- Node.js 18+
- Monday.com account with Work Orders + Deals boards imported
- Anthropic API key (Claude claude-sonnet-4-20250514)
- Monday.com API key

### 1. Import CSV data into Monday.com

1. Go to your Monday.com workspace
2. Create a new board called **"Work Orders"**
3. Import `work_orders.csv` (Main menu → Import → Excel/CSV)
4. Create a new board called **"Deals"**
5. Import `deals.csv`
6. Set appropriate column types:
   - Date fields → Date type
   - Dollar amounts → Numbers type
   - Status/Stage fields → Status or Dropdown type

### 2. Get Monday.com API Key

1. Click your avatar → **Admin** → **API**
2. Copy your personal API token (v2)
3. Note your board IDs from the board URLs: `monday.com/boards/{BOARD_ID}`

### 3. Local Development

```bash
# Install dependencies
npm install

# Create .env.local
cp .env.example .env.local
# Edit .env.local with your keys

# Run dev server
npm run dev
```

Visit http://localhost:3000

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add ANTHROPIC_API_KEY
vercel env add MONDAY_API_KEY
vercel env add NEXT_PUBLIC_HAS_KEYS  # set to "true" to skip config UI
```

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
MONDAY_API_KEY=eyJ0...

# Optional: skip config UI for evaluators
NEXT_PUBLIC_HAS_KEYS=true
```

> **Evaluator note**: If env vars are set, the app works immediately with no configuration. If not, enter keys in the Settings panel in the UI — they're saved to your browser only.

---

## Features

### Core
- **Live Monday.com queries** — every question hits the API fresh
- **Agentic tool use** — Claude orchestrates multi-step data retrieval
- **Data normalization** — handles nulls, inconsistent dates, currency strings
- **Cross-board analysis** — correlates Work Orders and Deals data
- **Visible action trace** — collapsible tool call log under every response

### Query Examples
- *"How's our energy sector pipeline this quarter?"*
- *"What are the top 5 deals by value?"*
- *"Show work orders by status"*
- *"Give me an executive summary of both boards"*
- *"Which sector has the highest average deal size?"*

### Follow-up Queries
The agent maintains conversation context — ask "Show me top deals", then "Now filter those by energy sector" and it understands the reference.

---

## Data Handling

| Issue | Handling |
|---|---|
| Null/empty values | Filtered from aggregations, flagged in logs |
| Currency strings (`$1,234,567`) | Stripped and parsed to float |
| Inconsistent dates | Normalized to ISO 8601 (YYYY-MM-DD) |
| Case-inconsistent text | Lowercased for filtering |
| Missing fields in query | Agent uses `get_board_schema` first |
| >30% missing data in a field | Warning logged in tool trace |
