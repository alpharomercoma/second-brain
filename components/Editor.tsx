'use client';

import { useMemo } from 'react';

type Props = {
  openPath?: string;
  content: string;
  dirty: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

function stats(text: string) {
  const words = (text.trim().match(/\S+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return { words, minutes, chars: text.length };
}

export default function Editor({ openPath, content, dirty, onChange, onSave }: Props) {
  const { words, minutes, chars } = useMemo(() => stats(content), [content]);

  if (!openPath) {
    return (
      <section className="manuscript">
        <div className="blank">
          <h2>
            What will you <em>make</em> next?
          </h2>
          <p>
            Open a document from the archive, or start a new one. Then ask the studio below to mine
            your past work for ideas worth pursuing.
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
        <span className="crumb">
          {dir}
          <b>{name}</b>
        </span>
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
        <div className="sheet" key={openPath}>
          <textarea
            className="editor"
            value={content}
            spellCheck={false}
            placeholder="Begin writing here, or let the studio draft into this page…"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onSave();
              }
            }}
          />
        </div>
      </div>

      <div className="foot">
        <span>{words} words</span>
        <span>{chars} chars</span>
        <span>{minutes} min read</span>
      </div>
    </section>
  );
}
