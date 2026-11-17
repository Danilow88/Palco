import { requireIdentity } from "../../../../cursor/identity.js";
import {
  callbackUrl,
  clearStateCookie,
  clientConfig,
  exchangeCode,
  readPending,
  sameToken,
  sessionCookie,
} from "@/lib/youtube-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return Response.redirect(home(request, "auth"));

  const url = new URL(request.url);
  if (url.searchParams.get("error") === "access_denied") return done(request, "denied");

  const client = clientConfig();
  const redirectUri = callbackUrl(url.origin);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!client.id || !redirectUri || !code || !state) return done(request, "failed");

  const pending = await readPending(request, client.cookieSecret);
  if (!pending || !sameToken(pending.state, state)) return done(request, "failed");

  const session = await exchangeCode({
    code,
    clientId: client.id,
    clientSecret: client.secret,
    redirectUri,
    verifier: pending.verifier,
  });
  if (!session) return done(request, "failed");

  const headers = new Headers({
    location: home(request, "connected"),
    "cache-control": "no-store",
  });
  headers.append("set-cookie", await sessionCookie(session, request, client.cookieSecret));
  headers.append("set-cookie", clearStateCookie(request));
  return new Response(null, { status: 302, headers });
}

function home(request: Request, flag: string): string {
  const url = new URL("/", request.url);
  url.searchParams.set("youtube", flag);
  return url.toString();
}

function done(request: Request, flag: string): Response {
  const headers = new Headers({
    location: home(request, flag),
    "cache-control": "no-store",
    "set-cookie": clearStateCookie(request),
  });
  return new Response(null, { status: 302, headers });
}
