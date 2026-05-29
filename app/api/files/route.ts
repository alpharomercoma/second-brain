import { listDocs } from '@/lib/blob-docs';

/** GET /api/files?prefix=  -> list the document tree (flat list of paths). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get('prefix') ?? '';
  try {
    const files = await listDocs(prefix);
    return Response.json({ files });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
