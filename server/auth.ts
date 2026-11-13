// Authentication for the world server.
// - Supabase mode: the client sends its Supabase access token (JWT). It is verified with HS256 and
//   SUPABASE_JWT_SECRET (legacy JWT secret), or against the project's JWKS (asymmetric signing keys: RS256/ES256).
// - DEV mode (no Supabase configured at all): the client sends a display name and is trusted. Never use in production.
import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { UserAuth } from './world';
import type { WorldStore } from './store';

export interface AuthConfig { jwtSecret?: string; jwksUrl?: string; devMode: boolean; audience: string; issuer?: string }
export function authConfigFromEnv(env: Record<string, string | undefined> = process.env): AuthConfig {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const jwksUrl = env.SUPABASE_JWKS_URL || (!env.SUPABASE_JWT_SECRET && url ? `${url}/auth/v1/.well-known/jwks.json` : undefined);
  return { jwtSecret: env.SUPABASE_JWT_SECRET || undefined, jwksUrl, devMode: !env.SUPABASE_JWT_SECRET && !jwksUrl, audience: env.SUPABASE_JWT_AUD || 'authenticated', issuer: url ? `${url}/auth/v1` : undefined };
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export interface JwtClaims { sub: string; exp?: number; nbf?: number; aud?: string | string[]; iss?: string; role?: string; email?: string; user_metadata?: Record<string, any> }

let jwks: { at: number; keys: Map<string, { key: KeyObject; alg: string }> } | null = null;
async function jwksKey(url: string, kid: string | undefined): Promise<{ key: KeyObject; alg: string } | null> {
  if (!jwks || Date.now() - jwks.at > 10 * 60_000 || (kid && !jwks.keys.has(kid))) {
    const r = await fetch(url); if (!r.ok) throw new Error(`JWKS ${r.status}`);
    const body = (await r.json()) as { keys: any[] };
    const keys = new Map<string, { key: KeyObject; alg: string }>();
    for (const k of body.keys ?? []) { try { keys.set(k.kid ?? '', { key: createPublicKey({ key: k, format: 'jwk' }), alg: k.alg ?? (k.kty === 'EC' ? 'ES256' : 'RS256') }); } catch { /* skip unsupported keys */ } }
    jwks = { at: Date.now(), keys };
  }
  return jwks.keys.get(kid ?? '') ?? (jwks.keys.size === 1 ? [...jwks.keys.values()][0] : null);
}

/** Verifies a JWT; returns its claims or throws. */
export async function verifyJwt(token: string, cfg: AuthConfig, now = Date.now()): Promise<JwtClaims> {
  const parts = token.split('.'); if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(b64url(parts[0]).toString('utf8')); const claims = JSON.parse(b64url(parts[1]).toString('utf8')) as JwtClaims;
  const data = Buffer.from(`${parts[0]}.${parts[1]}`); const sig = b64url(parts[2]);
  if (header.alg === 'HS256') {
    if (!cfg.jwtSecret) throw new Error('HS256 tokens need SUPABASE_JWT_SECRET');
    const want = createHmac('sha256', cfg.jwtSecret).update(data).digest();
    if (want.length !== sig.length || !timingSafeEqual(want, sig)) throw new Error('bad signature');
  } else if (header.alg === 'RS256' || header.alg === 'ES256') {
    if (!cfg.jwksUrl) throw new Error('asymmetric tokens need a JWKS URL');
    const k = await jwksKey(cfg.jwksUrl, header.kid); if (!k) throw new Error('unknown signing key');
    const ok = header.alg === 'RS256' ? cryptoVerify('RSA-SHA256', data, k.key, sig) : cryptoVerify('SHA256', data, { key: k.key, dsaEncoding: 'ieee-p1363' }, sig);
    if (!ok) throw new Error('bad signature');
  } else throw new Error(`unsupported alg ${header.alg}`);
  const t = Math.floor(now / 1000);
  if (typeof claims.exp === 'number' && claims.exp < t - 30) throw new Error('token expired');
  if (typeof claims.nbf === 'number' && claims.nbf > t + 30) throw new Error('token not yet valid');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (cfg.audience && !aud.includes(cfg.audience)) throw new Error('wrong audience');
  if (cfg.issuer && claims.iss && claims.iss !== cfg.issuer) throw new Error('wrong issuer');
  if (!claims.sub) throw new Error('no subject');
  return claims;
}

export function cleanName(n: unknown): string | null {
  if (typeof n !== 'string') return null;
  const t = n.normalize('NFC').replace(/[\u0000-\u001f\u007f<>"\\]/g, '').replace(/\s+/g, ' ').trim();
  return t.length >= 3 && t.length <= 24 ? t : null;
}

/** Turns a hello message into a user, or an error message. */
export async function authenticate(hello: { token?: string; name?: string }, cfg: AuthConfig, store: WorldStore): Promise<UserAuth | { error: string }> {
  if (cfg.devMode) {
    const name = cleanName(hello.name);
    if (!name) return { error: 'Choose a display name of 3 to 24 characters.' };
    return { uid: 'dev-' + name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-'), name, admin: false };
  }
  if (!hello.token) return { error: 'Please sign in first.' };
  try {
    const c = await verifyJwt(hello.token, cfg);
    if (c.role && c.role !== 'authenticated') return { error: 'Not a signed-in user.' };
    const name = (await store.profileName(c.sub)) ?? cleanName(c.user_metadata?.display_name) ?? cleanName(c.email?.split('@')[0]) ?? 'Player ' + c.sub.slice(0, 6);
    return { uid: c.sub, name, admin: await store.isAdmin(c.sub) };
  } catch (e: any) {
    return { error: `Sign-in rejected: ${e?.message ?? e}` };
  }
}

/** Test helper: sign an HS256 token. */
export function signHs256(claims: Record<string, any>, secret: string): string {
  const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' }), body = enc(claims);
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}
