// Monday.com GraphQL API client

const MONDAY_API_URL = 'https://api.monday.com/v2';

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
  value?: string;
  text?: string;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumn[];
  created_at?: string;
  updated_at?: string;
}

export interface MondayBoard {
  id: string;
  name: string;
  description?: string;
  columns: { id: string; title: string; type: string }[];
  items_page: {
    items: MondayItem[];
    cursor?: string;
  };
}

export interface ApiCallLog {
  timestamp: string;
  type: 'query' | 'info' | 'error' | 'success';
  message: string;
  details?: string;
}

async function mondayRequest(query: string, variables?: Record<string, unknown>, apiKey?: string) {
  const key = apiKey || process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not configured');

  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': key,
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Monday API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

export async function getBoards(apiKey?: string): Promise<{ id: string; name: string }[]> {
  const query = `query { boards(limit: 50) { id name } }`;
  const data = await mondayRequest(query, {}, apiKey);
  return data.boards || [];
}

export async function getBoardData(boardId: string, apiKey?: string, limit = 500): Promise<MondayBoard> {
  const query = `
    query ($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        id
        name
        description
        columns {
          id
          title
          type
        }
        items_page(limit: $limit) {
          items {
            id
            name
            created_at
            updated_at
            column_values {
              id
              title
              type
              value
              text
            }
          }
        }
      }
    }
  `;
  const data = await mondayRequest(query, { boardId, limit }, apiKey);
  if (!data.boards || data.boards.length === 0) {
    throw new Error(`Board ${boardId} not found`);
  }
  return data.boards[0];
}

export async function searchBoardItems(boardId: string, searchTerm: string, apiKey?: string): Promise<MondayItem[]> {
  const query = `
    query ($boardId: ID!, $term: String!) {
      items_by_name(board_id: $boardId, name: $term, limit: 50) {
        id
        name
        column_values {
          id
          title
          type
          value
          text
        }
      }
    }
  `;
  try {
    const data = await mondayRequest(query, { boardId, term: searchTerm }, apiKey);
    return data.items_by_name || [];
  } catch {
    // Fallback: return empty if search fails
    return [];
  }
}

// Normalize messy data from monday boards into clean records
export function normalizeItems(items: MondayItem[]): Record<string, string | number | null>[] {
  return items.map(item => {
    const record: Record<string, string | number | null> = {
      id: item.id,
      name: item.name,
      created_at: item.created_at || null,
      updated_at: item.updated_at || null,
    };

    for (const col of item.column_values) {
      const key = col.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      let value: string | number | null = null;

      // Use text field first (human readable), fall back to value
      const raw = col.text || col.value || null;

      if (raw === null || raw === '' || raw === '{}' || raw === 'null') {
        value = null;
      } else if (col.type === 'numeric' || col.type === 'numbers') {
        // Handle currency strings like "$1,234,567"
        const cleaned = raw.toString().replace(/[$,\s]/g, '');
        const num = parseFloat(cleaned);
        value = isNaN(num) ? null : num;
      } else if (col.type === 'date') {
        // Normalize dates
        value = normalizeDate(raw.toString());
      } else if (col.type === 'dropdown' || col.type === 'status' || col.type === 'color') {
        // Extract label from JSON if needed
        try {
          const parsed = JSON.parse(raw.toString());
          value = parsed.label || parsed.text || parsed.name || raw.toString();
        } catch {
          value = raw.toString().trim();
        }
      } else {
        value = raw.toString().trim() || null;
      }

      record[key] = value;
    }

    return record;
  });
}

function normalizeDate(raw: string): string | null {
  if (!raw || raw === 'null' || raw === '{}') return null;
  
  // Try to parse various date formats
  const cleanRaw = raw.trim();
  
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(cleanRaw)) return cleanRaw.substring(0, 10);
  
  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = cleanRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    // Assume MM/DD/YYYY for US format
    return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  // Try native Date parse
  const d = new Date(cleanRaw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().substring(0, 10);
  }

  return cleanRaw; // Return as-is if can't parse
}

export function computeStats(records: Record<string, string | number | null>[], field: string) {
  const values = records
    .map(r => r[field])
    .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
    .map(v => Number(v));

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    count: values.length,
    sum,
    avg,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
  };
}

export function groupBy<T extends Record<string, unknown>>(
  records: T[],
  field: string
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const record of records) {
    const key = (record[field] as string) || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  }
  return groups;
}

export function filterByDateRange(
  records: Record<string, string | number | null>[],
  dateField: string,
  start: string,
  end: string
) {
  return records.filter(r => {
    const d = r[dateField];
    if (!d) return false;
    return d >= start && d <= end;
  });
}
