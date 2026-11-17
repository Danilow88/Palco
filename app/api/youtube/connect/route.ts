import { requireIdentity } from "../../../../cursor/identity.js";
import { beginConnect, callbackUrl, clientConfig, codeChallenge, googleAuthUrl } from "@/lib/youtube-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return Response.redirect(home(request, "auth"));

  const client = clientConfig();
  const redirectUri = callbackUrl(new URL(request.url).origin);
  if (!client.id || !client.cookieSecret || !redirectUri) return Response.redirect(home(request, "setup"));

  const pending = await beginConnect(request, client.cookieSecret);
  const location = googleAuthUrl({
    clientId: client.id,
    redirectUri,
    state: pending.state,
    codeChallenge: await codeChallenge(pending.verifier),
  });
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
      "set-cookie": pending.cookie,
    },
  });
}

function home(request: Request, flag: string): string {
  const url = new URL("/", request.url);
  url.searchParams.set("youtube", flag);
  return url.toString();
}
