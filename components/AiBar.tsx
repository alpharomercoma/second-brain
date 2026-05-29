'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

type Props = {
  openPath?: string;
  contextPaths?: string[];
  /** Called when the agent writes a document, so the editor can update live. */
  onDocumentWrite: (path: string, content: string) => void;
};

function toolName(type: string): string {
  return type.startsWith('tool-') ? type.slice(5) : type;
}

const TOOL_VERB: Record<string, string> = {
  searchFiles: 'searching the archive',
  readFile: 'reading a document',
  listFiles: 'browsing the archive',
  writeDocument: 'writing to the page',
};

export default function AiBar({ openPath, contextPaths, onDocumentWrite }: Props) {
  const [input, setInput] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const appliedWrites = useRef<Set<string>>(new Set());

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  const busy = status === 'submitted' || status === 'streaming';

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

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    sendMessage({ text }, { body: { openPath, contextPaths } });
  }

  return (
    <section className="console">
      <div className={'console-status' + (busy ? ' busy' : '')}>
        <span className="live" />
        <span>{busy ? statusLabel : 'studio'}</span>
        <span className="spacer" />
        <span className="ctx">{openPath ? `→ ${openPath}` : 'no page open'}</span>
      </div>

      <div className="transcript" ref={transcriptRef}>
        {messages.map((m) => (
          <div key={m.id} className={'turn ' + m.role}>
            <div className="who">{m.role === 'user' ? 'You' : 'Atelier'}</div>
            {m.parts?.map((part: any, i: number) => renderPart(part, `${m.id}:${i}`))}
          </div>
        ))}
      </div>

      <div className="prompt">
        <span className="caret">▍</span>
        <input
          placeholder={
            openPath
              ? `Mine your work for ideas, or draft into ${openPath.split('/').pop()}…`
              : 'Ask the studio for new ideas from your past work…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="send stop" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>
    </section>
  );
}

function renderPart(part: any, key: string) {
  const type: string = part.type;

  if (type === 'text') {
    return part.text ? (
      <div key={key} className="said">
        {part.text}
      </div>
    ) : null;
  }

  if (type === 'reasoning') {
    return part.text ? (
      <div key={key} className="reason">
        {part.text}
      </div>
    ) : null;
  }

  if (type.startsWith('tool-') || type === 'dynamic-tool') {
    const name = type === 'dynamic-tool' ? part.toolName : toolName(type);
    const running = part.state === 'input-streaming' || part.state === 'input-available';
    return (
      <div key={key} className={'step' + (running ? ' running' : '')}>
        <div className="head">
          <span className="pip" />
          <span className="tname">{name}</span>
          {running && <span style={{ color: 'var(--console-faint)' }}>· working…</span>}
        </div>
        {part.input != null && <div className="meta">{summarize(part.input)}</div>}
        {part.state === 'output-available' && part.output != null && (
          <div className="meta">{summarizeOutput(name, part.output)}</div>
        )}
        {part.state === 'output-error' && (
          <div className="meta">error: {String(part.errorText ?? 'tool failed')}</div>
        )}
      </div>
    );
  }

  return null;
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
