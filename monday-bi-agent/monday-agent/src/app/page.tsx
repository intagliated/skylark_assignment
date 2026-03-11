'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface LogEntry {
  tool: string;
  logs: string[];
  input: unknown;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  logs?: LogEntry[];
  timestamp: Date;
}

const SAMPLE_QUERIES = [
  "How's our pipeline looking for energy sector this quarter?",
  "What are our top 5 deals by value?",
  "Show me work orders by status",
  "What's the total revenue in the pipeline?",
  "Which sectors have the most active deals?",
  "Give me an executive summary of both boards",
];

function ToolLog({ logs }: { logs: LogEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalLines = logs.reduce((acc, l) => acc + l.logs.length, 0);

  return (
    <div className="mt-2 mb-1">
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: 'transparent',
          border: '1px solid #2a2a32',
          borderRadius: '4px',
          padding: '4px 10px',
          color: '#7a7a90',
          fontFamily: 'inherit',
          fontSize: '11px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ color: '#6c63ff' }}>⚡</span>
        {logs.length} tool call{logs.length !== 1 ? 's' : ''} · {totalLines} log lines
        <span style={{ marginLeft: 2 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{
          marginTop: '6px',
          background: '#0d0d10',
          border: '1px solid #1e1e24',
          borderRadius: '6px',
          padding: '12px',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          {logs.map((entry, i) => (
            <div key={i} style={{ marginBottom: i < logs.length - 1 ? '12px' : 0 }}>
              <div style={{
                fontSize: '10px',
                color: '#6c63ff',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '4px',
              }}>
                TOOL: {entry.tool}
                {entry.input && Object.keys(entry.input as object).length > 0 && (
                  <span style={{ color: '#4a4a60', fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>
                    ({JSON.stringify(entry.input).substring(0, 60)}...)
                  </span>
                )}
              </div>
              {entry.logs.map((line, j) => (
                <div key={j} className="log-line" style={{
                  color: line.startsWith('❌') ? '#ef4444'
                    : line.startsWith('✅') ? '#10b981'
                    : line.startsWith('⚠️') ? '#f59e0b'
                    : line.startsWith('📡') ? '#6c63ff'
                    : '#7a7a90',
                  paddingLeft: '8px',
                  borderLeft: `2px solid ${
                    line.startsWith('❌') ? '#ef444430'
                    : line.startsWith('✅') ? '#10b98130'
                    : line.startsWith('📡') ? '#6c63ff30'
                    : '#1e1e24'
                  }`,
                  marginBottom: '2px',
                }}>
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';

  return (
    <div className="animate-in" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '4px',
        color: '#4a4a60',
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {isUser ? (
          <>YOU · {msg.timestamp.toLocaleTimeString()}</>
        ) : (
          <><span style={{ color: '#6c63ff' }}>●</span> AGENT · {msg.timestamp.toLocaleTimeString()}</>
        )}
      </div>

      <div style={{
        maxWidth: '80%',
        background: isUser ? '#18181c' : '#111113',
        border: `1px solid ${isUser ? '#2a2a32' : '#1e1e24'}`,
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '12px 14px',
        color: isUser ? '#b0b0c8' : '#e8e8f0',
      }}>
        {isUser ? (
          <span style={{ fontFamily: 'var(--font-body)' }}>{msg.content}</span>
        ) : (
          <MarkdownContent content={msg.content} />
        )}
      </div>

      {!isUser && msg.logs && msg.logs.length > 0 && (
        <div style={{ maxWidth: '80%', width: '100%' }}>
          <ToolLog logs={msg.logs} />
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown renderer
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    if (line.startsWith('## ')) {
      elements.push(
        <div key={i} style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: '#e8e8f0', marginTop: '12px', marginBottom: '6px' }}>
          {line.slice(3)}
        </div>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <div key={i} style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: '#fff', marginTop: '4px', marginBottom: '8px' }}>
          {line.slice(2)}
        </div>
      );
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: '4px', marginBottom: '2px' }}>
          <span style={{ color: '#6c63ff', flexShrink: 0 }}>·</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1];
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: '4px', marginBottom: '2px' }}>
          <span style={{ color: '#6c63ff', flexShrink: 0, minWidth: '16px' }}>{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>
      );
    } else if (line === '') {
      elements.push(<div key={i} style={{ height: '6px' }} />);
    } else {
      elements.push(
        <div key={i} style={{ marginBottom: '2px' }}>
          {renderInline(line)}
        </div>
      );
    }
    i++;
  }

  return <div style={{ fontFamily: 'var(--font-body)', lineHeight: 1.7 }}>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    // Code: `text`
    if (part.includes('`')) {
      const codeParts = part.split(/(`[^`]+`)/g);
      return codeParts.map((cp, j) => {
        if (cp.startsWith('`') && cp.endsWith('`')) {
          return (
            <code key={j} style={{
              background: '#18181c',
              border: '1px solid #2a2a32',
              borderRadius: '3px',
              padding: '1px 5px',
              fontSize: '11px',
              color: '#6c63ff',
            }}>
              {cp.slice(1, -1)}
            </code>
          );
        }
        return <span key={j}>{cp}</span>;
      });
    }
    return <span key={i}>{part}</span>;
  });
}

function TypingIndicator() {
  return (
    <div className="animate-in" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      color: '#4a4a60',
      fontSize: '10px',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '16px',
    }}>
      <span style={{ color: '#6c63ff' }} className="pulse-soft">●</span>
      <span>Agent is querying Monday.com...</span>
      <span className="spin-slow" style={{ fontSize: '12px' }}>⟳</span>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [mondayKey, setMondayKey] = useState('');
  const [mondayBoardUrl, setMondayBoardUrl] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [configSaved, setConfigSaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Load from localStorage if available
    const savedAnthropicKey = localStorage.getItem('anthropic_key') || '';
    const savedMondayKey = localStorage.getItem('monday_key') || '';
    const savedBoardUrl = localStorage.getItem('monday_board_url') || '';
    if (savedAnthropicKey && savedMondayKey) {
      setAnthropicKey(savedAnthropicKey);
      setMondayKey(savedMondayKey);
      setMondayBoardUrl(savedBoardUrl);
      setShowConfig(false);
      setConfigSaved(true);
    }
    // Check env-based config
    if (process.env.NEXT_PUBLIC_HAS_KEYS === 'true') {
      setShowConfig(false);
      setConfigSaved(true);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const saveConfig = () => {
    localStorage.setItem('anthropic_key', anthropicKey);
    localStorage.setItem('monday_key', mondayKey);
    localStorage.setItem('monday_board_url', mondayBoardUrl);
    setShowConfig(false);
    setConfigSaved(true);
  };

  const sendMessage = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content || loading) return;

    const userMsg: Message = { role: 'user', content, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build conversation history for API
    const history = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          apiKey: anthropicKey || undefined,
          mondayApiKey: mondayKey || undefined,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**Error:** ${data.error}\n\nPlease check your API keys in the configuration panel.`,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message || 'No response received.',
          logs: data.logs || [],
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Connection error:** Unable to reach the API. Please try again.`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, anthropicKey, mondayKey]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <div style={{
        width: '240px',
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}>
            <span className="gradient-text">BI</span>
            <span style={{ color: '#e8e8f0' }}> Agent</span>
          </div>
          <div style={{ color: '#4a4a60', fontSize: '10px', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Monday.com Intelligence
          </div>
        </div>

        {/* Config status */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: configSaved ? '#10b981' : '#f59e0b',
          }}>
            <span>{configSaved ? '●' : '○'}</span>
            {configSaved ? 'Connected' : 'Not configured'}
          </div>
          {mondayBoardUrl && (
            <a
              href={mondayBoardUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                marginTop: '8px',
                fontSize: '10px',
                color: '#6c63ff',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ↗ View Monday.com Board
            </a>
          )}
          <button
            onClick={() => setShowConfig(c => !c)}
            style={{
              marginTop: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '4px 8px',
              color: '#7a7a90',
              fontFamily: 'inherit',
              fontSize: '10px',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            {showConfig ? '↑ Hide Config' : '⚙ Configure'}
          </button>
        </div>

        {/* Sample queries */}
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          <div style={{
            fontSize: '10px',
            color: '#4a4a60',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '10px',
          }}>
            Sample Queries
          </div>
          {SAMPLE_QUERIES.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              disabled={loading || !configSaved}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '6px 0',
                color: loading || !configSaved ? '#2a2a32' : '#7a7a90',
                fontFamily: 'inherit',
                fontSize: '11px',
                cursor: loading || !configSaved ? 'not-allowed' : 'pointer',
                borderBottom: '1px solid #1a1a20',
                lineHeight: 1.4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => {
                if (!loading && configSaved) (e.target as HTMLButtonElement).style.color = '#e8e8f0';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.color = loading || !configSaved ? '#2a2a32' : '#7a7a90';
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* New conversation */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setMessages([])}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '6px',
              color: '#7a7a90',
              fontFamily: 'inherit',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            + New Conversation
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Config panel */}
        {showConfig && (
          <div style={{
            background: '#0f0f14',
            borderBottom: '1px solid var(--border)',
            padding: '16px 24px',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '12px',
              fontWeight: 600,
              color: '#6c63ff',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '12px',
            }}>
              Configuration
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ fontSize: '10px', color: '#4a4a60', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={e => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: '#e8e8f0',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ fontSize: '10px', color: '#4a4a60', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Monday.com API Key
                </label>
                <input
                  type="password"
                  value={mondayKey}
                  onChange={e => setMondayKey(e.target.value)}
                  placeholder="eyJ0..."
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: '#e8e8f0',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ flex: 2, minWidth: '280px' }}>
                <label style={{ fontSize: '10px', color: '#4a4a60', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Monday.com Board URL (for evaluators)
                </label>
                <input
                  type="text"
                  value={mondayBoardUrl}
                  onChange={e => setMondayBoardUrl(e.target.value)}
                  placeholder="https://your-workspace.monday.com/boards/..."
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: '#e8e8f0',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={saveConfig}
                  disabled={!anthropicKey || !mondayKey}
                  style={{
                    background: anthropicKey && mondayKey ? '#6c63ff' : '#2a2a32',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 16px',
                    color: anthropicKey && mondayKey ? '#fff' : '#4a4a60',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    cursor: anthropicKey && mondayKey ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Save & Connect
                </button>
              </div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '10px', color: '#4a4a60' }}>
              Keys are stored locally in your browser only. Alternatively, set ANTHROPIC_API_KEY and MONDAY_API_KEY environment variables on Vercel.
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}>
          {messages.length === 0 && !loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '32px',
                fontStyle: 'italic',
                color: '#2a2a32',
                lineHeight: 1.2,
              }}>
                Ask anything about<br />your business data
              </div>
              <div style={{ fontSize: '12px', color: '#4a4a60' }}>
                {configSaved
                  ? 'Connected to Monday.com · Try a sample query or type your own'
                  : 'Configure your API keys above to get started'}
              </div>
              {!configSaved && (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 16px',
                  background: '#18181c',
                  border: '1px solid #f59e0b30',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#f59e0b',
                }}>
                  ⚠ API keys required — click ⚙ Configure in the sidebar
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {loading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '16px 24px',
          background: 'var(--surface)',
        }}>
          <div style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px 14px',
            transition: 'border-color 0.15s',
          }}
          onFocus={() => {}}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={configSaved ? 'Ask a business question... (Enter to send)' : 'Configure API keys first'}
              disabled={!configSaved || loading}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e8e8f0',
                fontFamily: 'inherit',
                fontSize: '13px',
                resize: 'none',
                lineHeight: 1.5,
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || !configSaved}
              style={{
                background: input.trim() && !loading && configSaved ? '#6c63ff' : '#2a2a32',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                color: input.trim() && !loading && configSaved ? '#fff' : '#4a4a60',
                fontFamily: 'inherit',
                fontSize: '12px',
                cursor: input.trim() && !loading && configSaved ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {loading ? '...' : 'Send →'}
            </button>
          </div>
          <div style={{ marginTop: '6px', fontSize: '10px', color: '#2a2a32', textAlign: 'center' }}>
            Shift+Enter for new line · Every query fetches live data from Monday.com
          </div>
        </div>
      </div>
    </div>
  );
}
