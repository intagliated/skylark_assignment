import { getBoardData, getBoards, normalizeItems, computeStats, groupBy, filterByDateRange } from './monday';

export interface ToolResult {
  logs: string[];
  data: unknown;
  summary: string;
}

// Tool definitions for Claude
export const tools = [
  {
    name: 'list_boards',
    description: 'List all available Monday.com boards to discover what data exists. Always call this first if you are unsure which board to query.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'query_board',
    description: 'Fetch all items from a Monday.com board and return normalized, cleaned data. Use this to answer questions about deals, work orders, pipeline, revenue, etc.',
    input_schema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'string',
          description: 'The Monday.com board ID to query',
        },
        filters: {
          type: 'object',
          description: 'Optional filters to apply: { field, value, operator } or { date_field, start, end }',
          properties: {
            field: { type: 'string' },
            value: { type: 'string' },
            date_field: { type: 'string' },
            date_start: { type: 'string' },
            date_end: { type: 'string' },
          },
        },
        group_by: {
          type: 'string',
          description: 'Field name to group results by (e.g., "sector", "status", "stage")',
        },
        aggregate_field: {
          type: 'string',
          description: 'Numeric field to compute statistics on (e.g., "deal_value", "revenue")',
        },
        sort_by: {
          type: 'string',
          description: 'Field to sort results by',
        },
        sort_desc: {
          type: 'boolean',
          description: 'Sort descending if true',
        },
        limit: {
          type: 'number',
          description: 'Limit number of results returned (default: all)',
        },
      },
      required: ['board_id'],
    },
  },
  {
    name: 'cross_board_analysis',
    description: 'Perform analysis across multiple boards simultaneously (e.g., correlate work orders with deals). Returns combined insights.',
    input_schema: {
      type: 'object',
      properties: {
        board_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of board IDs to analyze together',
        },
        analysis_type: {
          type: 'string',
          enum: ['overview', 'sector_breakdown', 'timeline', 'performance'],
          description: 'Type of cross-board analysis to run',
        },
      },
      required: ['board_ids', 'analysis_type'],
    },
  },
  {
    name: 'get_board_schema',
    description: 'Get the column structure/schema of a board to understand what fields are available before querying.',
    input_schema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'string',
          description: 'The board ID to inspect',
        },
      },
      required: ['board_id'],
    },
  },
];

// Execute a tool call and return results with logs
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  apiKey: string
): Promise<ToolResult> {
  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  try {
    if (toolName === 'list_boards') {
      log('📡 Calling Monday.com API: GET /boards');
      const boards = await getBoards(apiKey);
      log(`✅ Retrieved ${boards.length} boards`);
      return {
        logs,
        data: boards,
        summary: `Found ${boards.length} boards: ${boards.map(b => `${b.name} (${b.id})`).join(', ')}`,
      };
    }

    if (toolName === 'get_board_schema') {
      const boardId = toolInput.board_id as string;
      log(`📡 Calling Monday.com API: GET board schema for board ${boardId}`);
      const board = await getBoardData(boardId, apiKey, 1);
      log(`✅ Retrieved schema: ${board.columns.length} columns`);
      return {
        logs,
        data: { name: board.name, columns: board.columns },
        summary: `Board "${board.name}" has columns: ${board.columns.map(c => `${c.title} (${c.type})`).join(', ')}`,
      };
    }

    if (toolName === 'query_board') {
      const boardId = toolInput.board_id as string;
      const filters = toolInput.filters as Record<string, string> | undefined;
      const groupByField = toolInput.group_by as string | undefined;
      const aggregateField = toolInput.aggregate_field as string | undefined;
      const sortBy = toolInput.sort_by as string | undefined;
      const sortDesc = toolInput.sort_desc as boolean | undefined;
      const limit = toolInput.limit as number | undefined;

      log(`📡 Calling Monday.com API: GET board items for board ${boardId}`);
      const board = await getBoardData(boardId, apiKey);
      log(`✅ Fetched ${board.items_page.items.length} items from "${board.name}"`);
      log(`🔄 Normalizing data (handling nulls, date formats, currency values)...`);

      let records = normalizeItems(board.items_page.items);
      const totalFetched = records.length;

      // Apply field filter
      if (filters?.field && filters?.value) {
        const filterField = filters.field.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const filterValue = filters.value.toLowerCase();
        const before = records.length;
        records = records.filter(r => {
          const val = r[filterField];
          if (val === null || val === undefined) return false;
          return val.toString().toLowerCase().includes(filterValue);
        });
        log(`🔍 Applied filter "${filters.field} contains '${filters.value}'": ${before} → ${records.length} records`);
      }

      // Apply date range filter
      if (filters?.date_field && filters?.date_start && filters?.date_end) {
        const dateField = filters.date_field.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const before = records.length;
        records = filterByDateRange(records, dateField, filters.date_start, filters.date_end);
        log(`📅 Applied date filter ${filters.date_start} to ${filters.date_end}: ${before} → ${records.length} records`);
      }

      // Sort
      if (sortBy) {
        const sortField = sortBy.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        records.sort((a, b) => {
          const av = a[sortField] ?? '';
          const bv = b[sortField] ?? '';
          if (typeof av === 'number' && typeof bv === 'number') {
            return sortDesc ? bv - av : av - bv;
          }
          return sortDesc
            ? bv.toString().localeCompare(av.toString())
            : av.toString().localeCompare(bv.toString());
        });
        log(`↕️ Sorted by "${sortBy}" ${sortDesc ? 'descending' : 'ascending'}`);
      }

      // Group by
      let groupedData: Record<string, unknown> | null = null;
      if (groupByField) {
        const gField = groupByField.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const groups = groupBy(records as Record<string, unknown>[], gField);
        log(`📊 Grouped by "${groupByField}": ${Object.keys(groups).length} groups`);

        groupedData = {};
        for (const [groupKey, groupRecords] of Object.entries(groups)) {
          const groupTyped = groupRecords as Record<string, string | number | null>[];
          const groupInfo: Record<string, unknown> = {
            count: groupRecords.length,
            items: groupTyped.slice(0, 10), // Preview items
          };
          if (aggregateField) {
            const aggField = aggregateField.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            const stats = computeStats(groupTyped, aggField);
            if (stats) {
              groupInfo.stats = stats;
              log(`💰 Computed ${aggregateField} stats for group "${groupKey}": sum=$${stats.sum.toLocaleString()}, avg=$${stats.avg.toFixed(0)}`);
            }
          }
          groupedData[groupKey] = groupInfo;
        }
      }

      // Overall stats
      let overallStats = null;
      if (aggregateField && !groupByField) {
        const aggField = aggregateField.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        overallStats = computeStats(records, aggField);
        if (overallStats) {
          log(`📈 Computed stats for "${aggregateField}": sum=${overallStats.sum.toLocaleString()}, avg=${overallStats.avg.toFixed(0)}, count=${overallStats.count}`);
        }
      }

      // Null analysis
      const nullCounts: Record<string, number> = {};
      if (records.length > 0) {
        const fields = Object.keys(records[0]);
        for (const field of fields) {
          const nulls = records.filter(r => r[field] === null || r[field] === undefined).length;
          if (nulls > 0) nullCounts[field] = nulls;
        }
        const problematicFields = Object.entries(nullCounts)
          .filter(([, count]) => count > records.length * 0.3)
          .map(([f, c]) => `${f}: ${Math.round((c / records.length) * 100)}% missing`);
        if (problematicFields.length > 0) {
          log(`⚠️ Data quality note: ${problematicFields.join(', ')}`);
        }
      }

      // Limit output
      const displayRecords = limit ? records.slice(0, limit) : records;

      return {
        logs,
        data: {
          board_name: board.name,
          total_fetched: totalFetched,
          filtered_count: records.length,
          columns: board.columns.map(c => c.title),
          records: displayRecords,
          grouped: groupedData,
          overall_stats: overallStats,
          data_quality: nullCounts,
        },
        summary: `Queried ${board.name}: ${records.length} records${groupByField ? ` grouped by ${groupByField}` : ''}${aggregateField ? ` with ${aggregateField} stats` : ''}`,
      };
    }

    if (toolName === 'cross_board_analysis') {
      const boardIds = toolInput.board_ids as string[];
      const analysisType = toolInput.analysis_type as string;

      log(`📡 Initiating cross-board analysis across ${boardIds.length} boards`);
      
      const boardResults = [];
      for (const bid of boardIds) {
        log(`📡 Fetching board ${bid}...`);
        const board = await getBoardData(bid, apiKey);
        const records = normalizeItems(board.items_page.items);
        log(`✅ Board "${board.name}": ${records.length} items`);
        boardResults.push({ board, records });
      }

      log(`🔄 Running ${analysisType} cross-board analysis...`);

      const analysis: Record<string, unknown> = {
        analysis_type: analysisType,
        boards: boardResults.map(({ board, records }) => ({
          name: board.name,
          id: board.id,
          item_count: records.length,
          columns: board.columns.map(c => ({ title: c.title, type: c.type })),
          sample: records.slice(0, 5),
        })),
      };

      if (analysisType === 'sector_breakdown') {
        for (const { board, records } of boardResults) {
          // Try to find sector-like field
          const sectorField = Object.keys(records[0] || {}).find(k =>
            k.includes('sector') || k.includes('industry') || k.includes('vertical') || k.includes('category')
          );
          if (sectorField) {
            const groups = groupBy(records as Record<string, unknown>[], sectorField);
            log(`📊 "${board.name}" sector breakdown via field "${sectorField}": ${Object.keys(groups).length} sectors`);
            (analysis as Record<string, unknown>)[`${board.name}_sectors`] = Object.fromEntries(
              Object.entries(groups).map(([k, v]) => [k, (v as unknown[]).length])
            );
          }
        }
      }

      return {
        logs,
        data: analysis,
        summary: `Cross-board analysis complete for ${boardResults.map(b => b.board.name).join(' & ')}`,
      };
    }

    throw new Error(`Unknown tool: ${toolName}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`❌ Error: ${msg}`);
    return {
      logs,
      data: { error: msg },
      summary: `Error executing ${toolName}: ${msg}`,
    };
  }
}
