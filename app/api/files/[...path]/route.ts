import { readDoc, writeDoc, deleteDoc } from '@/lib/blob-docs';

type Ctx = { params: Promise<{ path: string[] }> };

function joinPath(segments: string[]): string {
  return segments.map((s) => decodeURIComponent(s)).join('/');
}

/** GET /api/files/<path...>  -> read a document's content. */
export async function GET(_req: Request, { params }: Ctx) {
  const { path } = await params;
  try {
    const doc = await readDoc(joinPath(path));
    if (!doc) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json(doc);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** PUT /api/files/<path...>  body: { content }  -> create or overwrite. */
export async function PUT(req: Request, { params }: Ctx) {
  const { path } = await params;
  try {
    const { content } = (await req.json()) as { content: string };
    const result = await writeDoc(joinPath(path), content ?? '');
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/files/<path...>  -> delete a document. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { path } = await params;
  try {
    const result = await deleteDoc(joinPath(path));
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
