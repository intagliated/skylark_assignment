import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from '@/lib/tools';

const SYSTEM_PROMPT = `You are a Business Intelligence Agent for Monday.com. You help founders and executives get quick, accurate answers to business questions by querying live Monday.com board data.

CAPABILITIES:
- Query work orders and deals boards in real-time
- Analyze pipeline health, revenue, sector performance, operational metrics
- Handle messy, incomplete data gracefully
- Support follow-up questions that build on context

BEHAVIOR RULES:
1. ALWAYS use tools to fetch live data — never make up or estimate numbers
2. Start by listing boards if you don't know which boards exist
3. Use get_board_schema before query_board if you're unsure about field names
4. When data is missing or incomplete, acknowledge it and still provide useful insights from available data
5. For ambiguous queries, make a reasonable interpretation and state your assumption
6. For follow-up questions, reuse board IDs from prior context to avoid redundant API calls
7. Format responses with clear sections: Key Findings, Data, Caveats (if any)
8. Express currency values clearly (e.g., $1.2M not 1200000)
9. When grouping or filtering, normalize text (case-insensitive matching)

DATA QUALITY:
- Missing values should be noted but not block analysis
- Inconsistent text fields (e.g., "Energy", "energy sector", "ENERGY") should be treated as the same
- Invalid dates should be skipped with a note

RESPONSE FORMAT:
- Be concise and direct — founders want answers, not essays
- Use bullet points for lists
- Bold key metrics
- Always state confidence level if data is incomplete`;

export async function POST(req: NextRequest) {
  const { messages, apiKey, mondayApiKey } = await req.json();

  const anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
  const mondayKey = mondayApiKey || process.env.MONDAY_API_KEY;

  if (!anthropicKey) {
    return NextResponse.json({ error: 'Anthropic API key required' }, { status: 400 });
  }
  if (!mondayKey) {
    return NextResponse.json({ error: 'Monday.com API key required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  const allLogs: { tool: string; logs: string[]; input: unknown }[] = [];

  // Agentic loop
  let currentMessages = messages;
  let finalText = '';
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: tools as Parameters<typeof client.messages.create>[0]['tools'],
      messages: currentMessages,
    });

    // Collect any text
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length > 0) {
      finalText = textBlocks.map(b => (b as { type: 'text'; text: string }).text).join('\n');
    }

    // Check stop reason
    if (response.stop_reason === 'end_turn') {
      break;
    }

    if (response.stop_reason !== 'tool_use') {
      break;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    if (toolUseBlocks.length === 0) break;

    const toolResults = [];
    for (const block of toolUseBlocks) {
      const toolBlock = block as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
      
      const result = await executeTool(toolBlock.name, toolBlock.input, mondayKey);
      
      allLogs.push({
        tool: toolBlock.name,
        logs: result.logs,
        input: toolBlock.input,
      });

      toolResults.push({
        type: 'tool_result' as const,
        tool_use_id: toolBlock.id,
        content: JSON.stringify({
          summary: result.summary,
          data: result.data,
        }),
      });
    }

    // Continue conversation
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }

  return NextResponse.json({
    message: finalText,
    logs: allLogs,
  });
}
