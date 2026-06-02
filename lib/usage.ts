'use client';

/**
 * Local-first usage analytics. Each completed assistant turn appends one event
 * to localStorage — no server storage. Pure summarize() is shared by the
 * analytics page.
 */

export type UsageEvent = {
  id: string; // assistant message id (dedupe key)
  ts: number;
  model: string | null;
  input: number;
  output: number;
  total: number;
  toolsByName: Record<string, number>;
};

const KEY = 'tt.usage.v1';
const MAX = 2000;

export function loadUsage(): UsageEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as UsageEvent[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function recordUsage(e: UsageEvent): void {
  try {
    const list = loadUsage();
    if (list.some((x) => x.id === e.id)) return; // dedupe
    list.push(e);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export function clearUsage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export type DayBucket = { day: string; input: number; output: number };

export type UsageSummary = {
  messages: number;
  input: number;
  output: number;
  total: number;
  toolCalls: number;
  byModel: { model: string; total: number; count: number }[];
  byTool: { name: string; count: number }[];
  byDay: DayBucket[];
  firstTs: number | null;
  lastTs: number | null;
};

const dayKey = (ts: number) => {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export function summarize(events: UsageEvent[], days = 30): UsageSummary {
  let input = 0,
    output = 0,
    total = 0,
    toolCalls = 0;
  const models = new Map<string, { total: number; count: number }>();
  const tools = new Map<string, number>();
  const dayMap = new Map<string, { input: number; output: number }>();

  for (const e of events) {
    input += e.input;
    output += e.output;
    total += e.total;
    const m = e.model || 'unknown';
    const mm = models.get(m) ?? { total: 0, count: 0 };
    mm.total += e.total;
    mm.count += 1;
    models.set(m, mm);
    for (const [name, n] of Object.entries(e.toolsByName || {})) {
      toolCalls += n;
      tools.set(name, (tools.get(name) ?? 0) + n);
    }
    const dk = dayKey(e.ts);
    const dd = dayMap.get(dk) ?? { input: 0, output: 0 };
    dd.input += e.input;
    dd.output += e.output;
    dayMap.set(dk, dd);
  }

  // Continuous last-`days` window (so the chart has even spacing incl. empty days).
  const byDay: DayBucket[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const dk = dayKey(now - i * 86_400_000);
    const dd = dayMap.get(dk) ?? { input: 0, output: 0 };
    byDay.push({ day: dk, input: dd.input, output: dd.output });
  }

  const ts = events.map((e) => e.ts);
  return {
    messages: events.length,
    input,
    output,
    total,
    toolCalls,
    byModel: [...models.entries()]
      .map(([model, v]) => ({ model, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total),
    byTool: [...tools.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byDay,
    firstTs: ts.length ? Math.min(...ts) : null,
    lastTs: ts.length ? Math.max(...ts) : null,
  };
}

/** Compact number formatting: 1234 -> "1.2k". */
export function fmt(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}
