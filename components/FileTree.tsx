'use client';

import { useMemo, useState } from 'react';
import type { DocEntry } from '@/lib/blob-docs';

type Props = {
  files: DocEntry[];
  openPath?: string;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onCreate: (path: string) => void;
  onRefresh: () => void;
};

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
};

/** Build a nested folder/file tree from flat blob pathnames. */
function buildTree(files: DocEntry[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === part && c.isDir === !isLeaf);
      if (!child) {
        child = { name: part, path, isDir: !isLeaf, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
    );
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export default function FileTree({
  files,
  openPath,
  onOpen,
  onDelete,
  onCreate,
  onRefresh,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(files), [files]);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  let i = 0; // for staggered entrance animation
  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    return node.children.map((child) => {
      const delay = `${Math.min(i++ * 28, 360)}ms`;
      const pad = { paddingLeft: 10 + depth * 14 } as const;

      if (child.isDir) {
        const isCollapsed = collapsed.has(child.path);
        return (
          <div key={'d:' + child.path}>
            <div
              className={'row folder' + (isCollapsed ? ' collapsed' : '')}
              style={{ ...pad, animationDelay: delay }}
              onClick={() => toggle(child.path)}
            >
              <span className="twirl">▾</span>
              <span className="name">{child.name}</span>
            </div>
            {!isCollapsed && renderNode(child, depth + 1)}
          </div>
        );
      }

      const active = child.path === openPath;
      return (
        <div
          key={'f:' + child.path}
          className={'row file' + (active ? ' active' : '')}
          style={{ ...pad, animationDelay: delay }}
          onClick={() => onOpen(child.path)}
        >
          <span className="dot" />
          <span className="name">{child.name}</span>
          <span
            className="trash"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete ${child.path}?`)) onDelete(child.path);
            }}
          >
            ✕
          </span>
        </div>
      );
    });
  };

  return (
    <aside className="index">
      <div className="index-head">
        <h1 className="wordmark">
          Ate<em>l</em>ier
        </h1>
        <div className="tagline">Idea studio · grounded in your work</div>
      </div>

      <div className="index-bar">
        <span className="label">Archive</span>
        <div className="index-actions">
          <button
            className="ghost-btn"
            title="New document"
            onClick={() => setCreating((v) => !v)}
          >
            +
          </button>
          <button className="ghost-btn" title="Refresh" onClick={onRefresh}>
            ↻
          </button>
        </div>
      </div>

      <div className="tree">
        {creating && (
          <input
            autoFocus
            className="new-input"
            placeholder="folder/title.md"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                onCreate(draft.trim());
                setDraft('');
                setCreating(false);
              }
              if (e.key === 'Escape') {
                setDraft('');
                setCreating(false);
              }
            }}
          />
        )}

        {files.length === 0 && !creating ? (
          <div className="tree-empty">
            Nothing archived yet. Press <strong>+</strong> to begin a new document.
          </div>
        ) : (
          renderNode(tree, 0)
        )}
      </div>
    </aside>
  );
}
