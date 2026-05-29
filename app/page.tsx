'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DocEntry } from '@/lib/blob-docs';
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';
import AiBar from '@/components/AiBar';

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export default function Home() {
  const [files, setFiles] = useState<DocEntry[]>([]);
  const [openPath, setOpenPath] = useState<string | undefined>();
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  const refreshTree = useCallback(async () => {
    const res = await fetch('/api/files');
    if (res.ok) setFiles((await res.json()).files ?? []);
  }, []);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  const openFile = useCallback(async (path: string) => {
    const res = await fetch(`/api/files/${enc(path)}`);
    const data = res.ok ? await res.json() : { content: '' };
    setOpenPath(path);
    setContent(data.content ?? '');
    setDirty(false);
  }, []);

  const saveFile = useCallback(async () => {
    if (!openPath) return;
    await fetch(`/api/files/${enc(openPath)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setDirty(false);
    refreshTree();
  }, [openPath, content, refreshTree]);

  const createFile = useCallback(
    async (path: string) => {
      await fetch(`/api/files/${enc(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });
      await refreshTree();
      openFile(path);
    },
    [refreshTree, openFile],
  );

  const deleteFile = useCallback(
    async (path: string) => {
      await fetch(`/api/files/${enc(path)}`, { method: 'DELETE' });
      if (path === openPath) {
        setOpenPath(undefined);
        setContent('');
      }
      refreshTree();
    },
    [openPath, refreshTree],
  );

  // The agent wrote a document via writeDocument: reflect it live and surface it.
  const onDocumentWrite = useCallback(
    (path: string, newContent: string) => {
      setOpenPath(path);
      setContent(newContent);
      setDirty(false); // the tool already persisted it to Blob
      refreshTree();
    },
    [refreshTree],
  );

  return (
    <div className="studio">
      <FileTree
        files={files}
        openPath={openPath}
        onOpen={openFile}
        onDelete={deleteFile}
        onCreate={createFile}
        onRefresh={refreshTree}
      />
      <Editor
        openPath={openPath}
        content={content}
        dirty={dirty}
        onChange={(v) => {
          setContent(v);
          setDirty(true);
        }}
        onSave={saveFile}
      />
      <AiBar
        openPath={openPath}
        contextPaths={openPath ? [openPath] : undefined}
        onDocumentWrite={onDocumentWrite}
      />
    </div>
  );
}
