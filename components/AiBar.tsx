'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Markdown from 'markdown-to-jsx';
import {
  MODELS,
  DEFAULT_MODEL,
  DEFAULT_PARAMS,
  PARAM_RANGE,
  isKnownModel,
  modelInfo,
  type ChatParams,
} from '@/lib/models';
import {
  type Conversation,
  loadConversations,
  saveConversation,
  deleteConversation,
  titleFor,
  relTime,
  newId,
} from '@/lib/history';
import { snapshotForChat } from '@/lib/docs-local';
import { recordUsage } from '@/lib/usage';
import Link from 'next/link';

type Props = {
  openPath?: string;
  apiKey: string | null;
  onChangeApiKey: (key: string) => void;
  /** Called when the agent writes a document, so the editor can persist/update it. */
  onDocumentWrite: (path: string, content: string) => void;
};

function toolName(type: string): string {
  return type.startsWith('tool-') ? type.slice(5) : type;
}

const TOOL_VERB: Record<string, string> = {
  searchFiles: 'searching your files',
  readFile: 'reading a document',
  listFiles: 'browsing your files',
  writeDocument: 'writing to the page',
};

const isTrace = (p: any) =>
  p.type === 'reasoning' || p.type?.startsWith('tool-') || p.type === 'dynamic-tool';

const base = (p: string) => p.split('/').pop() || p;

export default function AiBar({ openPath, apiKey, onChangeApiKey, onDocumentWrite }: Props) {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [params, setParams] = useState<ChatParams>(DEFAULT_PARAMS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  // Panel size: 'min' (focus the document) · 'normal' · 'max' (focus the AI, full screen).
  const [size, setSize] = useState<'min' | 'normal' | 'max'>('normal');
  // On small screens the model picker drops its description to stay compact.
  const [compact, setCompact] = useState(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const appliedWrites = useRef<Set<string>>(new Set());
  const recorded = useRef<Set<string>>(new Set());

  // Auto-grow the prompt, but keep it modest so the generation stays visible.
  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.19)) + 'px';
  }

  // Restore model + params + conversation list (client-only, after mount).
  useEffect(() => {
    try {
      const m = localStorage.getItem('aibar.model');
      if (isKnownModel(m ?? undefined)) setModel(m as string);
      const p = localStorage.getItem('aibar.params');
      if (p) setParams({ ...DEFAULT_PARAMS, ...JSON.parse(p) });
      const s = localStorage.getItem('aibar.size');
      if (s === 'min' || s === 'normal' || s === 'max') setSize(s);
    } catch {}
    setConversations(loadConversations());
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('aibar.size', size);
    } catch {}
  }, [size]);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 560px)');
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const ORDER = ['min', 'normal', 'max'] as const;
  function grow() {
    setSize((s) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)]);
  }
  function shrink() {
    setSize((s) => ORDER[Math.max(0, ORDER.indexOf(s) - 1)]);
  }
  useEffect(() => {
    try {
      localStorage.setItem('aibar.model', model);
    } catch {}
  }, [model]);
  useEffect(() => {
    try {
      localStorage.setItem('aibar.params', JSON.stringify(params));
    } catch {}
  }, [params]);

  const { messages, setMessages, sendMessage, status, stop, error, regenerate, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  const busy = status === 'submitted' || status === 'streaming';

  // Persist the active conversation once an exchange settles.
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return;
    const id = activeId ?? newId();
    if (!activeId) setActiveId(id);
    setConversations(
      saveConversation({ id, title: titleFor(messages), updatedAt: Date.now(), messages }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Record token/tool usage for the just-finished assistant turn (analytics).
  useEffect(() => {
    if (status !== 'ready') return;
    const last = messages[messages.length - 1] as any;
    if (!last || last.role !== 'assistant' || recorded.current.has(last.id)) return;
    recorded.current.add(last.id);
    const meta = last.metadata ?? {};
    const usage = meta.usage ?? { input: 0, output: 0, total: 0 };
    const toolsByName: Record<string, number> = {};
    for (const p of (last.parts ?? []) as any[]) {
      const n = p.type === 'dynamic-tool' ? p.toolName : p.type?.startsWith('tool-') ? toolName(p.type) : null;
      if (n && p.state === 'output-available') toolsByName[n] = (toolsByName[n] ?? 0) + 1;
    }
    recordUsage({
      id: last.id,
      ts: Date.now(),
      model: meta.model ?? model,
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      total: usage.total ?? 0,
      toolsByName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Live status label derived from the latest activity (transparency).
  const statusLabel = useMemo(() => {
    if (status === 'submitted') return 'thinking';
    if (status !== 'streaming') return 'ready';
    const last = messages[messages.length - 1];
    const parts = last?.role === 'assistant' ? last.parts ?? [] : [];
    for (let k = parts.length - 1; k >= 0; k--) {
      const p: any = parts[k];
      if (p.type?.startsWith('tool-') || p.type === 'dynamic-tool') {
        if (p.state === 'input-streaming' || p.state === 'input-available') {
          const n = p.type === 'dynamic-tool' ? p.toolName : toolName(p.type);
          return TOOL_VERB[n] ?? `running ${n}`;
        }
      }
      if (p.type === 'reasoning' && p.text) return 'reasoning';
      if (p.type === 'text' && p.text) return 'composing';
    }
    return 'thinking';
  }, [messages, status]);

  // Apply writeDocument tool outputs to the editor as they complete.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      m.parts?.forEach((part: any, i: number) => {
        if (toolName(part.type) !== 'writeDocument') return;
        if (part.state !== 'output-available') return;
        const out = part.output;
        if (!out || out.error || typeof out.content !== 'string') return;
        const key = `${m.id}:${i}`;
        if (appliedWrites.current.has(key)) return;
        appliedWrites.current.add(key);
        onDocumentWrite(out.path, out.content);
      });
    }
  }, [messages, onDocumentWrite]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    clearError();
    // Local-first: send the user's key + a snapshot of their local docs. The agent
    // figures out which files to query via tools (over that snapshot).
    const docs = await snapshotForChat();
    sendMessage({ text: t }, { body: { openPath, model, params, apiKey: apiKey ?? undefined, docs } });
  }

  function newChat() {
    setMessages([]);
    setActiveId(null);
    appliedWrites.current.clear();
    setHistoryOpen(false);
  }

  function openConversation(c: Conversation) {
    // Pre-seed applied writes so re-opening a chat doesn't replay edits onto the doc.
    c.messages.forEach((m: any) =>
      (m.parts ?? []).forEach((p: any, i: number) => {
        if (toolName(p.type) === 'writeDocument') appliedWrites.current.add(`${m.id}:${i}`);
      }),
    );
    setMessages(c.messages as any);
    setActiveId(c.id);
    setHistoryOpen(false);
  }

  function removeConversation(id: string) {
    setConversations(deleteConversation(id));
    if (id === activeId) newChat();
  }

  const reasoning = modelInfo(model)?.reasoning;
  const now = Date.now();

  return (
    <section className={'console size-' + size}>
      {/* CONTROLS: model picker + settings · status · history */}
      <div className="console-bar">
        <div className="modelpick">
          <span className="cpu" aria-hidden>
            ◇
          </span>
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model" title="Model">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {compact ? m.label : m.label + (m.note ? ` — ${m.note}` : '')}
              </option>
            ))}
          </select>
          <button
            className={'gear' + (settingsOpen ? ' on' : '')}
            onClick={() => setSettingsOpen((v) => !v)}
            title="Generation settings"
            aria-label="Generation settings"
            aria-expanded={settingsOpen}
          >
            ⚙
          </button>
          <span className="why" tabIndex={0} role="note" aria-label="Why Mistral?">
            <span className="why-i" aria-hidden>
              ⓘ
            </span>
            <span className="why-tip" role="tooltip">
              <b>Why Mistral?</b> Its API has a free tier — no credit card, just phone verification —
              with a generous monthly allowance (about <b>1 billion tokens / month</b>) at
              prototyping-level rate limits. Plenty to build and brainstorm at no cost.
            </span>
          </span>
        </div>

        {(busy || reasoning) && (
          <div className={'status' + (busy ? ' busy' : '')}>
            <span className="live" />
            <span>{busy ? statusLabel : 'reasoning model'}</span>
          </div>
        )}

        <div className="bar-actions">
          <Link className="bar-btn" href="/analytics" title="Usage analytics" aria-label="Usage analytics">
            <span className="bi" aria-hidden>
              ▦
            </span>
            <span className="bl">Stats</span>
          </Link>
          <div className="sizer" role="group" aria-label="Panel size">
            <button
              className="size-btn"
              onClick={grow}
              disabled={size === 'max'}
              title="Expand — focus the assistant"
              aria-label="Expand assistant"
            >
              ▴
            </button>
            <button
              className="size-btn"
              onClick={shrink}
              disabled={size === 'min'}
              title="Shrink — focus the document"
              aria-label="Shrink assistant"
            >
              ▾
            </button>
          </div>
          <button className="bar-btn" onClick={newChat} title="New chat" aria-label="New chat">
            <span className="bi" aria-hidden>
              ＋
            </span>
            <span className="bl">New</span>
          </button>
          <div className="hist-wrap">
            <button
              className={'bar-btn' + (historyOpen ? ' on' : '')}
              onClick={() => setHistoryOpen((v) => !v)}
              title="Conversation history"
              aria-label="Conversation history"
              aria-expanded={historyOpen}
            >
              <span className="bi" aria-hidden>
                ↺
              </span>
              <span className="bl">History{conversations.length ? ` · ${conversations.length}` : ''}</span>
            </button>
            {historyOpen && (
              <div className="hist-menu" role="menu">
                <div className="hist-head">Conversations</div>
                {conversations.length === 0 && <div className="hist-empty">No saved chats yet.</div>}
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={'hist-row' + (c.id === activeId ? ' on' : '')}
                    onClick={() => openConversation(c)}
                    role="menuitem"
                  >
                    <span className="hist-title">{c.title}</span>
                    <span className="hist-time">{relTime(c.updatedAt, now)}</span>
                    <button
                      className="hist-x"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeConversation(c.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {settingsOpen && (
          <div className="popover" role="dialog" aria-label="Generation settings">
            <div className="pop-head">
              <span>Generation</span>
              <button className="link" onClick={() => setParams(DEFAULT_PARAMS)}>
                Reset
              </button>
            </div>
            <Slider
              label="Temperature"
              v={params.temperature}
              range={PARAM_RANGE.temperature}
              onChange={(temperature) => setParams((p) => ({ ...p, temperature }))}
              hint="Higher = more creative"
            />
            <Slider
              label="Top P"
              v={params.topP}
              range={PARAM_RANGE.topP}
              onChange={(topP) => setParams((p) => ({ ...p, topP }))}
              hint="Nucleus sampling"
            />
            <Slider
              label="Max tokens"
              v={params.maxTokens}
              range={PARAM_RANGE.maxTokens}
              onChange={(maxTokens) => setParams((p) => ({ ...p, maxTokens }))}
              integer
              hint="Reply length cap"
            />
            <label className="ctrl">
              <span className="ctrl-row">
                <span className="ctrl-label">Mistral API key</span>
              </span>
              <input
                className="key-input"
                type="password"
                value={apiKey ?? ''}
                placeholder="sk-…"
                onChange={(e) => onChangeApiKey(e.target.value)}
              />
              <span className="ctrl-hint">Stored locally in this browser only.</span>
            </label>
          </div>
        )}
      </div>

      {/* HISTORY (the active conversation) */}
      {messages.length > 0 && (
        <div className="transcript" ref={transcriptRef}>
          {messages.map((m) => (
            <Turn key={m.id} message={m} />
          ))}
        </div>
      )}

      {/* ERROR — surfaced clearly, never silent */}
      {error && (
        <div className="chat-error" role="alert">
          <span className="ce-msg">⚠ {error.message || 'Something went wrong.'}</span>
          <span className="ce-actions">
            <button className="ce-btn" onClick={() => regenerate()}>
              Retry
            </button>
            <button className="ce-btn ghost" onClick={() => clearError()} aria-label="Dismiss error">
              Dismiss
            </button>
          </span>
        </div>
      )}

      {/* INPUT — or an inline key prompt when no Mistral key is set yet */}
      {apiKey ? (
        <div className="prompt">
          <textarea
            ref={inputRef}
            rows={2}
            placeholder={
              openPath
                ? `Brainstorm, or draft into ${base(openPath)}…   (Shift+Enter for a new line)`
                : 'Ask your second brain for new ideas from your past work…   (Shift+Enter for a new line)'
            }
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          {busy ? (
            <button className="send stop" onClick={() => stop()} title="Stop" aria-label="Stop">
              <span aria-hidden>■</span>
            </button>
          ) : (
            <button
              className="send"
              onClick={() => send(input)}
              disabled={!input.trim()}
              title="Send"
              aria-label="Send"
            >
              <span aria-hidden>↑</span>
            </button>
          )}
        </div>
      ) : (
        <div className="prompt keyprompt">
          <div className="key-row1">
            <span className="key-lead">
              Add your <b>Mistral API key</b> to start chatting
            </span>
            <a
              className="key-get"
              href="https://console.mistral.ai/home?profile_dialog=api-keys"
              target="_blank"
              rel="noreferrer noopener"
            >
              Get a key ↗
            </a>
          </div>
          <div className="key-row2">
            <input
              className="key-field"
              type="password"
              placeholder="paste your key…"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftKey.trim()) onChangeApiKey(draftKey.trim());
              }}
            />
            <button
              className="key-connect"
              disabled={!draftKey.trim()}
              onClick={() => onChangeApiKey(draftKey.trim())}
            >
              Connect
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---- a single conversation turn ---- */

const MD_OPTIONS = {
  disableParsingRawHTML: true,
  overrides: { a: { props: { target: '_blank', rel: 'noreferrer noopener' } } },
} as const;

const Turn = memo(function Turn({ message }: { message: any }) {
  const parts: any[] = message.parts ?? [];
  if (message.role === 'user') {
    return (
      <div className="turn user">
        <div className="who">You</div>
        {parts
          .filter((p) => p.type === 'text' && p.text)
          .map((p, i) => (
            <div key={i} className="said user-said">
              {p.text}
            </div>
          ))}
      </div>
    );
  }

  const trace = parts.filter(isTrace);
  const texts = parts.filter((p) => p.type === 'text' && p.text);
  const toolCount = trace.filter((p) => p.type !== 'reasoning').length;

  return (
    <div className="turn assistant">
      <div className="who">Second Brain</div>
      {trace.length > 0 && (
        <details className="trace">
          <summary>
            <span className="tw">▸</span>
            <span className="trace-label">
              {toolCount > 0 ? `${toolCount} tool ${toolCount === 1 ? 'step' : 'steps'}` : 'reasoning'}
            </span>
          </summary>
          <div className="trace-body">{trace.map((p, i) => renderTracePart(p, i))}</div>
        </details>
      )}
      {texts.map((p, i) => (
        <div key={'t' + i} className="said md">
          <Markdown options={MD_OPTIONS}>{p.text}</Markdown>
        </div>
      ))}
    </div>
  );
});

function renderTracePart(part: any, key: number) {
  if (part.type === 'reasoning') {
    return part.text ? (
      <div key={'r' + key} className="reason">
        {part.text}
      </div>
    ) : null;
  }
  const name = part.type === 'dynamic-tool' ? part.toolName : toolName(part.type);
  const running = part.state === 'input-streaming' || part.state === 'input-available';
  return (
    <div key={'s' + key} className={'step' + (running ? ' running' : '')}>
      <div className="head">
        <span className="pip" />
        <span className="tname">{name}</span>
        {running && <span className="working">· working…</span>}
      </div>
      {part.input != null && <div className="meta">{summarize(part.input)}</div>}
      {part.state === 'output-available' && part.output != null && (
        <div className="meta">{summarizeOutput(name, part.output)}</div>
      )}
      {part.state === 'output-error' && (
        <div className="meta err">error: {String(part.errorText ?? 'tool failed')}</div>
      )}
    </div>
  );
}

function Slider({
  label,
  v,
  range,
  onChange,
  hint,
  integer,
}: {
  label: string;
  v: number;
  range: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  hint?: string;
  integer?: boolean;
}) {
  return (
    <label className="ctrl">
      <span className="ctrl-row">
        <span className="ctrl-label">{label}</span>
        <span className="ctrl-val">{integer ? v : v.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="ctrl-hint">{hint}</span>}
    </label>
  );
}

function summarize(input: any): string {
  try {
    const s = JSON.stringify(input);
    return s.length > 220 ? s.slice(0, 220) + '…' : s;
  } catch {
    return '';
  }
}

function summarizeOutput(name: string, output: any): string {
  if (name === 'searchFiles')
    return `matched ${output.matched ?? 0}/${output.scanned ?? 0} docs${
      output.results?.length ? ': ' + output.results.map((r: any) => r.path).join(', ') : ''
    }`;
  if (name === 'listFiles') return `${output.files?.length ?? 0} files`;
  if (name === 'readFile')
    return output.error
      ? `not found: ${output.path}`
      : `read ${output.path} (${output.content?.length ?? 0} chars)`;
  if (name === 'writeDocument')
    return output.error
      ? `error: ${output.error}`
      : `wrote ${output.path} · ${output.bytesWritten} bytes · ${output.mode}`;
  return summarize(output);
}
