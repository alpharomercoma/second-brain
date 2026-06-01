'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadUsage, summarize, clearUsage, fmt, type UsageEvent, type DayBucket } from '@/lib/usage';
import { loadConversations } from '@/lib/history';
import { modelInfo } from '@/lib/models';

export default function Analytics() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [convos, setConvos] = useState(0);

  useEffect(() => {
    try {
      const t = localStorage.getItem('sb.theme');
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch {}
    setEvents(loadUsage());
    setConvos(loadConversations().length);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('sb.theme', theme);
    } catch {}
  }, [theme]);

  const s = useMemo(() => summarize(events), [events]);
  const empty = events.length === 0;

  function clearAll() {
    if (!confirm('Clear all locally-stored usage analytics? This cannot be undone.')) return;
    clearUsage();
    setEvents([]);
  }

  return (
    <div className="analytics">
      <header className="an-top">
        <Link className="an-back" href="/">
          ← Studio
        </Link>
        <h1 className="an-title">
          Usage <em>analytics</em>
        </h1>
        <div className="an-tools">
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button className="an-clear" onClick={clearAll} disabled={empty}>
            Clear data
          </button>
        </div>
      </header>

      <p className="an-sub">
        Everything here is computed from data stored only in this browser — across {s.messages}{' '}
        {s.messages === 1 ? 'message' : 'messages'}.
      </p>

      {empty ? (
        <div className="an-empty">
          No usage yet. Ask your second brain something, then come back — your token and tool-call
          history will appear here.
        </div>
      ) : (
        <>
          <section className="cards">
            <Stat label="Total tokens" value={fmt(s.total)} accent />
            <Stat label="Input tokens" value={fmt(s.input)} />
            <Stat label="Output tokens" value={fmt(s.output)} />
            <Stat label="Messages" value={`${s.messages}`} />
            <Stat label="Tool calls" value={`${s.toolCalls}`} />
            <Stat label="Conversations" value={`${convos}`} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Tokens over time</h2>
              <div className="legend">
                <span className="lg in">Input</span>
                <span className="lg out">Output</span>
              </div>
            </div>
            <DailyChart data={s.byDay} />
            <div className="an-axis">
              <span>30 days ago</span>
              <span>today</span>
            </div>
          </section>

          <div className="panel-grid">
            <section className="panel">
              <div className="panel-head">
                <h2>By model</h2>
                <span className="panel-note">total tokens</span>
              </div>
              <Bars
                rows={s.byModel.map((m) => ({
                  label: modelInfo(m.model)?.label ?? m.model,
                  value: m.total,
                  display: fmt(m.total),
                }))}
              />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>By tool</h2>
                <span className="panel-note">calls</span>
              </div>
              {s.byTool.length === 0 ? (
                <p className="an-none">No tool calls yet.</p>
              ) : (
                <Bars rows={s.byTool.map((t) => ({ label: t.name, value: t.count, display: `${t.count}` }))} />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={'card' + (accent ? ' accent' : '')}>
      <div className="card-val">{value}</div>
      <div className="card-label">{label}</div>
    </div>
  );
}

function DailyChart({ data }: { data: DayBucket[] }) {
  const W = 600;
  const H = 150;
  const pad = 6;
  const max = Math.max(1, ...data.map((d) => d.input + d.output));
  const n = data.length;
  const step = W / n;
  const bw = Math.max(2, step * 0.62);
  const scale = (v: number) => (v / max) * (H - pad * 2);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Daily token usage">
      {data.map((d, i) => {
        const x = i * step + (step - bw) / 2;
        const ih = scale(d.input);
        const oh = scale(d.output);
        const base = H - pad;
        return (
          <g key={i}>
            <rect className="bar-in" x={x} y={base - ih} width={bw} height={ih} />
            <rect className="bar-out" x={x} y={base - ih - oh} width={bw} height={oh} />
          </g>
        );
      })}
    </svg>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <span className="hbar-label" title={r.label}>
            {r.label}
          </span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="hbar-val">{r.display}</span>
        </div>
      ))}
    </div>
  );
}
