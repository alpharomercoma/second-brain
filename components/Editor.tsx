'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'markdown-to-jsx';

type Props = {
  openPath?: string;
  content: string;
  dirty: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
};

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      className={'sidebar-toggle' + (collapsed ? ' collapsed' : '')}
      onClick={onToggle}
      title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-label="Toggle sidebar"
    >
      <span className="sb-icon" aria-hidden>
        ⮜
      </span>
    </button>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function stats(text: string) {
  const words = (text.trim().match(/\S+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return { words, minutes, chars: text.length };
}

const MD_OPTIONS = {
  disableParsingRawHTML: true,
  overrides: { a: { props: { target: '_blank', rel: 'noreferrer noopener' } } },
} as const;

export default function Editor({
  openPath,
  content,
  dirty,
  theme,
  onToggleTheme,
  sidebarCollapsed,
  onToggleSidebar,
  onChange,
  onSave,
}: Props) {
  const { words, minutes, chars } = useMemo(() => stats(content), [content]);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit its content so the whole document is visible and
  // the page scrolls as one (no inner scrollbar, no text bleeding past the sheet).
  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  useEffect(() => {
    if (mode === 'edit') autosize();
  }, [content, mode, openPath]);

  if (!openPath) {
    return (
      <section className="manuscript">
        <div className="slug">
          <SidebarToggle collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
          <span className="crumb" />
          <div className="slug-tools">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
        <div className="blank">
          <h2>
            What will you <em>make</em> next?
          </h2>
          <p>
            Open a document from the sidebar, or start a new one. Then ask your second brain below to
            mine your past work for ideas worth pursuing.
          </p>
        </div>
      </section>
    );
  }

  const dir = openPath.includes('/') ? openPath.slice(0, openPath.lastIndexOf('/') + 1) : '';
  const name = openPath.slice(dir.length);

  return (
    <section className="manuscript">
      <div className="slug">
        <SidebarToggle collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
        <span className="crumb">
          {dir}
          <b>{name}</b>
        </span>

        <div className="slug-tools">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <div className="seg" role="tablist" aria-label="View mode">
            <button
              className={mode === 'edit' ? 'on' : ''}
              onClick={() => setMode('edit')}
              role="tab"
              aria-selected={mode === 'edit'}
            >
              Edit
            </button>
            <button
              className={mode === 'preview' ? 'on' : ''}
              onClick={() => setMode('preview')}
              role="tab"
              aria-selected={mode === 'preview'}
            >
              Preview
            </button>
          </div>
        </div>

        <span className={'state' + (dirty ? '' : ' saved')}>
          {dirty ? (
            <button className="save-btn" onClick={onSave} title="Save (⌘/Ctrl+S)">
              Save
            </button>
          ) : (
            <>
              <span className="seal" />
              Saved
            </>
          )}
        </span>
      </div>

      <div className="paper-scroll">
        <div className="sheet" key={openPath + mode}>
          {mode === 'edit' ? (
            <textarea
              ref={taRef}
              className="editor"
              value={content}
              spellCheck={false}
              placeholder="Begin writing here, or let your second brain draft into this page…"
              onChange={(e) => {
                onChange(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                  e.preventDefault();
                  onSave();
                }
              }}
            />
          ) : content.trim() ? (
            <div className="reader md">
              <Markdown options={MD_OPTIONS}>{content}</Markdown>
            </div>
          ) : (
            <p className="reader-empty">Nothing to preview yet.</p>
          )}
        </div>
      </div>

      <div className="foot">
        <div className="foot-inner">
          <span>{words} words</span>
          <span>{chars} chars</span>
          <span>{minutes} min read</span>
        </div>
      </div>
    </section>
  );
}
