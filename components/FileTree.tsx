'use client';

import { useMemo, useState } from 'react';
import type { DocEntry } from '@/lib/docs-local';

type Props = {
  files: DocEntry[];
  openPath?: string;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onCreate: (path: string) => void;
  onRename: (from: string, to: string, kind: 'file' | 'folder') => void;
  onNewFolder: (path: string) => void;
  onDeleteFolder: (prefix: string) => void;
  onRefresh: () => void;
};

type TreeNode = { name: string; path: string; isDir: boolean; children: TreeNode[] };

/** Build a nested folder/file tree from flat blob pathnames (hiding `.keep`). */
function buildTree(files: DocEntry[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    const leafIsMarker = parts[parts.length - 1] === '.keep';
    let node = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      if (isLeaf && leafIsMarker) return; // materialize folder, hide marker
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
    n.children.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p: string) => p.split('/').pop() || p;

export default function FileTree({
  files,
  openPath,
  onOpen,
  onDelete,
  onCreate,
  onRename,
  onNewFolder,
  onDeleteFolder,
  onRefresh,
}: Props) {
  const [creating, setCreating] = useState<null | 'file' | 'folder'>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // drag & drop
  const [drag, setDrag] = useState<{ path: string; kind: 'file' | 'folder' } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder path, or '' for root

  const tree = useMemo(() => buildTree(files), [files]);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  function startCreate(kind: 'file' | 'folder', prefix = '') {
    setCreating(kind);
    setDraft(prefix);
    setEditing(null);
  }
  function commitCreate() {
    const v = draft.trim();
    if (v) (creating === 'folder' ? onNewFolder : onCreate)(v);
    setDraft('');
    setCreating(null);
  }
  function startRename(node: TreeNode) {
    setEditing(node.path);
    setEditDraft(node.name);
    setCreating(null);
  }
  function commitRename(node: TreeNode) {
    const name = editDraft.trim();
    setEditing(null);
    if (!name || name === node.name) return;
    const parent = parentOf(node.path);
    const to = parent ? `${parent}/${name}` : name;
    onRename(node.path, to, node.isDir ? 'folder' : 'file');
  }

  // --- drag & drop: move a file/folder into a folder (or root) ---
  function validDrop(dest: string): boolean {
    if (!drag) return false;
    if (drag.kind === 'folder' && (dest === drag.path || dest.startsWith(drag.path + '/'))) return false;
    if (parentOf(drag.path) === dest) return false; // already there
    return true;
  }
  function resetDrag() {
    setDrag(null);
    setDropTarget(null);
  }
  function performMove(dest: string) {
    if (!drag || !validDrop(dest)) return resetDrag();
    const to = dest ? `${dest}/${baseOf(drag.path)}` : baseOf(drag.path);
    onRename(drag.path, to, drag.kind);
    resetDrag();
  }

  let i = 0;
  const renderNode = (node: TreeNode, depth: number): React.ReactNode =>
    node.children.map((child) => {
      const delay = `${Math.min(i++ * 24, 300)}ms`;
      const pad = { paddingLeft: 10 + depth * 14 } as const;
      const isEditing = editing === child.path;

      const renameField = (
        <input
          autoFocus
          className="rename-input"
          value={editDraft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditDraft(e.target.value)}
          onBlur={() => commitRename(child)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitRename(child);
            if (e.key === 'Escape') setEditing(null);
          }}
        />
      );

      const dragProps = {
        draggable: !isEditing,
        onDragStart: (e: React.DragEvent) => {
          setDrag({ path: child.path, kind: child.isDir ? 'folder' : 'file' });
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', child.path);
        },
        onDragEnd: resetDrag,
      };

      if (child.isDir) {
        const isCollapsed = collapsed.has(child.path);
        const isDropping = dropTarget === child.path;
        return (
          <div key={'d:' + child.path}>
            <div
              className={
                'row folder' + (isCollapsed ? ' collapsed' : '') + (isDropping ? ' drop' : '')
              }
              style={{ ...pad, animationDelay: delay }}
              onClick={() => !isEditing && toggle(child.path)}
              {...dragProps}
              onDragOver={(e) => {
                if (validDrop(child.path)) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dropTarget !== child.path) setDropTarget(child.path);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                performMove(child.path);
              }}
            >
              <span className="twirl">▾</span>
              {isEditing ? renameField : <span className="name">{child.name}</span>}
              <span className="actions">
                <button className="act" title="New file in folder" onClick={(e) => { e.stopPropagation(); startCreate('file', child.path + '/'); }}>
                  +
                </button>
                <button className="act" title="Rename folder" onClick={(e) => { e.stopPropagation(); startRename(child); }}>
                  ✎
                </button>
                <button className="act" title="Delete folder" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${child.path}" and everything in it?`)) onDeleteFolder(child.path); }}>
                  ✕
                </button>
              </span>
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
          onClick={() => !isEditing && onOpen(child.path)}
          {...dragProps}
        >
          <span className="dot" />
          {isEditing ? renameField : <span className="name">{child.name}</span>}
          <span className="actions">
            <button className="act" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(child); }}>
              ✎
            </button>
            <button className="act" title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${child.path}?`)) onDelete(child.path); }}>
              ✕
            </button>
          </span>
        </div>
      );
    });

  return (
    <aside className="index">
      <div className="index-head">
        <h1 className="wordmark">
          second<em>brain</em>
        </h1>
        <div className="tagline">Ideas, grounded in your work</div>
      </div>

      <div className="index-bar">
        <span className="label">Files</span>
        <div className="index-actions">
          <button className="ghost-btn" title="New file" onClick={() => startCreate('file')}>
            +
          </button>
          <button className="ghost-btn" title="New folder" onClick={() => startCreate('folder')}>
            ⊞
          </button>
          <button className="ghost-btn" title="Refresh" onClick={onRefresh}>
            ↻
          </button>
        </div>
      </div>

      <div
        className={'tree' + (dropTarget === '' ? ' droproot' : '')}
        onDragOver={(e) => {
          if (validDrop('')) {
            e.preventDefault();
            setDropTarget('');
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          performMove('');
        }}
      >
        {creating && (
          <input
            autoFocus
            className="new-input"
            placeholder={creating === 'folder' ? 'folder-name' : 'folder/title.md'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') {
                setDraft('');
                setCreating(null);
              }
            }}
          />
        )}

        {files.length === 0 && !creating ? (
          <div className="tree-empty">
            No files yet. Press <strong>+</strong> for a document or <strong>⊞</strong> for a folder.
          </div>
        ) : (
          renderNode(tree, 0)
        )}
      </div>
    </aside>
  );
}
