'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type DocEntry,
  listDocs,
  readDoc,
  writeDoc,
  deleteDoc,
  moveDoc,
  movePrefix,
  deletePrefix,
  seedIfEmpty,
  migrate,
  ONBOARDING_FILE,
} from '@/lib/docs-local';
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';
import AiBar from '@/components/AiBar';

const KEY_STORE = 'sb.mistralKey';

export default function Home() {
  const [files, setFiles] = useState<DocEntry[]>([]);
  const [openPath, setOpenPath] = useState<string | undefined>();
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // API key (local-first): gate the app until the user provides their Mistral key.
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  // --- theme ---
  useEffect(() => {
    try {
      const t = localStorage.getItem('sb.theme');
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('sb.theme', theme);
    } catch {}
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  // --- sidebar ---
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('sb.sidebar') === 'collapsed');
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('sb.sidebar', collapsed ? 'collapsed' : 'open');
    } catch {}
  }, [collapsed]);
  const toggleSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) {
      setNavOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  }, []);

  const setApiKey = useCallback((k: string) => {
    const v = k.trim();
    setApiKeyState(v || null);
    try {
      v ? localStorage.setItem(KEY_STORE, v) : localStorage.removeItem(KEY_STORE);
    } catch {}
  }, []);

  const refreshTree = useCallback(async () => {
    setFiles(await listDocs());
  }, []);

  const openFile = useCallback(async (path: string) => {
    const doc = await readDoc(path);
    setOpenPath(path);
    setContent(doc?.content ?? '');
    setDirty(false);
    setNavOpen(false);
  }, []);

  // Boot: load key, seed the onboarding doc, hydrate the tree, open onboarding.
  useEffect(() => {
    (async () => {
      try {
        setApiKeyState(localStorage.getItem(KEY_STORE));
      } catch {}
      await migrate();
      await seedIfEmpty();
      const fs = await listDocs();
      setFiles(fs);
      if (fs.some((f) => f.path === ONBOARDING_FILE)) await openFile(ONBOARDING_FILE);
      setBooted(true);
    })();
  }, [openFile]);

  const saveFile = useCallback(async () => {
    if (!openPath) return;
    await writeDoc(openPath, content);
    setDirty(false);
    refreshTree();
  }, [openPath, content, refreshTree]);

  const createFile = useCallback(
    async (path: string) => {
      await writeDoc(path, '');
      await refreshTree();
      openFile(path);
    },
    [refreshTree, openFile],
  );

  const deleteFile = useCallback(
    async (path: string) => {
      await deleteDoc(path);
      if (path === openPath) {
        setOpenPath(undefined);
        setContent('');
      }
      refreshTree();
    },
    [openPath, refreshTree],
  );

  const renameEntry = useCallback(
    async (from: string, to: string, kind: 'file' | 'folder') => {
      if (!to || to === from) return;
      if (kind === 'folder') await movePrefix(from, to);
      else await moveDoc(from, to);
      const remap = (p: string) =>
        kind === 'file'
          ? p === from
            ? to
            : p
          : p === from || p.startsWith(from + '/')
            ? to + p.slice(from.length)
            : p;
      setOpenPath((p) => (p ? remap(p) : p));
      await refreshTree();
    },
    [refreshTree],
  );

  const newFolder = useCallback(
    async (path: string) => {
      if (!path) return;
      await writeDoc(`${path.replace(/\/+$/, '')}/.keep`, '');
      refreshTree();
    },
    [refreshTree],
  );

  const deleteFolder = useCallback(
    async (prefix: string) => {
      await deletePrefix(prefix);
      if (openPath && (openPath === prefix || openPath.startsWith(prefix + '/'))) {
        setOpenPath(undefined);
        setContent('');
      }
      refreshTree();
    },
    [openPath, refreshTree],
  );

  // The agent wrote a document: persist it locally and reflect it in the editor.
  const onDocumentWrite = useCallback(
    async (path: string, newContent: string) => {
      await writeDoc(path, newContent);
      setOpenPath(path);
      setContent(newContent);
      setDirty(false);
      refreshTree();
    },
    [refreshTree],
  );

  if (!booted) return <div className="boot" aria-hidden />;

  return (
    <div className={'studio' + (navOpen ? ' nav-open' : '') + (collapsed ? ' collapsed' : '')}>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden />
      <FileTree
        files={files}
        openPath={openPath}
        onOpen={openFile}
        onDelete={deleteFile}
        onCreate={createFile}
        onRename={renameEntry}
        onNewFolder={newFolder}
        onDeleteFolder={deleteFolder}
        onRefresh={refreshTree}
      />
      <Editor
        openPath={openPath}
        content={content}
        dirty={dirty}
        theme={theme}
        onToggleTheme={toggleTheme}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        onChange={(v) => {
          setContent(v);
          setDirty(true);
        }}
        onSave={saveFile}
      />
      <AiBar
        openPath={openPath}
        apiKey={apiKey}
        onChangeApiKey={setApiKey}
        onDocumentWrite={onDocumentWrite}
      />
    </div>
  );
}
