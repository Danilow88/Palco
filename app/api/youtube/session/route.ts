import { requireIdentity } from "../../../../cursor/identity.js";
import { clearSessionCookie, clientConfig, loadSession } from "@/lib/youtube-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  const client = clientConfig();
  const session = client.cookieSecret ? await loadSession(request, client.cookieSecret) : null;
  return Response.json(
    { configured: client.id.length > 0, connected: Boolean(session) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store", "set-cookie": clearSessionCookie(request) },
  });
}
