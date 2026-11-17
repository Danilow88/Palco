export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

const SESSION = "palco_yt";
const STATE = "palco_yt_state";

export type YtSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type Pending = {
  state: string;
  verifier: string;
  exp: number;
};

export function clientConfig(): { id: string; secret: string; cookieSecret: string } {
  const id = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  return { id, secret, cookieSecret: secret || id };
}

export function callbackUrl(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowed = url.protocol === "https:" || (url.protocol === "http:" && local);
  if (!allowed) return null;
  return `${url.origin}/api/youtube/callback`;
}

export function googleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64url(buffer);
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function seal(payload: unknown, secret: string): Promise<string> {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))),
  );
  return `v1.${base64url(iv)}.${base64url(cipher)}`;
}

export async function open(token: string, secret: string): Promise<unknown | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !secret) return null;
  const iv = fromBase64url(parts[1]);
  const cipher = fromBase64url(parts[2]);
  if (!iv || !cipher) return null;
  try {
    const key = await aesKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      cipher as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0 || trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function writeCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  const flag = secure ? "; Secure" : "";
  const body = value ? encodeURIComponent(value) : "";
  return `${name}=${body}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${flag}`;
}

export async function beginConnect(request: Request, secret: string): Promise<{ cookie: string; state: string; verifier: string }> {
  const state = randomToken();
  const verifier = randomToken(48);
  const sealed = await seal({ state, verifier, exp: Date.now() + 10 * 60 * 1000 }, secret);
  return { cookie: writeCookie(STATE, sealed, 600, isSecure(request)), state, verifier };
}

export async function readPending(request: Request, secret: string): Promise<Pending | null> {
  const raw = readCookie(request.headers.get("cookie"), STATE);
  if (!raw) return null;
  const data = await open(raw, secret);
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<Pending>;
  if (typeof row.state !== "string" || typeof row.verifier !== "string" || typeof row.exp !== "number") return null;
  if (row.exp < Date.now()) return null;
  return { state: row.state, verifier: row.verifier, exp: row.exp };
}

export async function loadSession(request: Request, secret: string): Promise<YtSession | null> {
  if (!secret) return null;
  const raw = readCookie(request.headers.get("cookie"), SESSION);
  if (!raw) return null;
  const data = await open(raw, secret);
  return sessionFrom(data);
}

export async function sessionCookie(session: YtSession, request: Request, secret: string): Promise<string> {
  const sealed = await seal(session, secret);
  return writeCookie(SESSION, sealed, 60 * 60 * 24 * 30, isSecure(request));
}

export function clearSessionCookie(request: Request): string {
  return writeCookie(SESSION, "", 0, isSecure(request));
}

export function clearStateCookie(request: Request): string {
  return writeCookie(STATE, "", 0, isSecure(request));
}

export async function exchangeCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  verifier: string;
}): Promise<YtSession | null> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.verifier,
  });
  if (input.clientSecret) body.set("client_secret", input.clientSecret);
  return tokenSession(body, "");
}

export async function refreshSession(session: YtSession, clientId: string, clientSecret: string): Promise<YtSession | null> {
  const body = new URLSearchParams({
    refresh_token: session.refreshToken,
    client_id: clientId,
    grant_type: "refresh_token",
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  return tokenSession(body, session.refreshToken);
}

export async function ensureAccess(request: Request): Promise<
  | { ok: true; token: string; cookie?: string }
  | { ok: false; reason: "setup" | "connect" }
> {
  const client = clientConfig();
  if (!client.id) return { ok: false, reason: "setup" };
  const session = await loadSession(request, client.cookieSecret);
  if (!session) return { ok: false, reason: "connect" };
  if (session.expiresAt > Date.now() + 30_000) return { ok: true, token: session.accessToken };
  const refreshed = await refreshSession(session, client.id, client.secret);
  if (!refreshed) return { ok: false, reason: "connect" };
  return { ok: true, token: refreshed.accessToken, cookie: await sessionCookie(refreshed, request, client.cookieSecret) };
}

export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tokenSession(body: URLSearchParams, previousRefresh: string): Promise<YtSession | null> {
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!payload.access_token) return null;
  const refreshToken = payload.refresh_token || previousRefresh;
  if (!refreshToken) return null;
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return { accessToken: payload.access_token, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
}

function sessionFrom(data: unknown): YtSession | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<YtSession>;
  if (typeof row.accessToken !== "string" || typeof row.refreshToken !== "string" || typeof row.expiresAt !== "number") return null;
  return { accessToken: row.accessToken, refreshToken: row.refreshToken, expiresAt: row.expiresAt };
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
