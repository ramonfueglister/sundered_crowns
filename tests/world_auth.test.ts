// World server authentication: Supabase JWTs (HS256 secret or JWKS with ES256) and the DEV display-name login.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyJwt, authenticate, signHs256, authConfigFromEnv } from '../server/auth';
import { NullStore } from '../server/store';

const SECRET = 'test-secret-with-at-least-32-characters!!';
const UID = '00000000-0000-4000-8000-00000000000a';
const now = Math.floor(Date.now() / 1000);
const hsCfg = authConfigFromEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_JWT_SECRET: SECRET });

afterEach(() => vi.unstubAllGlobals());

describe('auth config', () => {
  it('is DEV mode only when nothing of Supabase is configured', () => {
    expect(authConfigFromEnv({}).devMode).toBe(true);
    expect(authConfigFromEnv({ SUPABASE_URL: 'https://proj.supabase.co' }).devMode).toBe(false);
    expect(authConfigFromEnv({ SUPABASE_URL: 'https://proj.supabase.co' }).jwksUrl).toBe('https://proj.supabase.co/auth/v1/.well-known/jwks.json');
  });
});

describe('HS256 tokens', () => {
  const good = { sub: UID, aud: 'authenticated', role: 'authenticated', exp: now + 600, iss: 'https://proj.supabase.co/auth/v1', email: 'alice@example.org' };
  it('accepts a valid token', async () => { expect((await verifyJwt(signHs256(good, SECRET), hsCfg)).sub).toBe(UID); });
  it('rejects a forged signature, an expired token, a wrong audience or issuer', async () => {
    await expect(verifyJwt(signHs256(good, 'another-secret'), hsCfg)).rejects.toThrow(/signature/);
    await expect(verifyJwt(signHs256({ ...good, exp: now - 3600 }, SECRET), hsCfg)).rejects.toThrow(/expired/);
    await expect(verifyJwt(signHs256({ ...good, aud: 'anon' }, SECRET), hsCfg)).rejects.toThrow(/audience/);
    await expect(verifyJwt(signHs256({ ...good, iss: 'https://evil.example/auth/v1' }, SECRET), hsCfg)).rejects.toThrow(/issuer/);
    const [h, , s] = signHs256(good, SECRET).split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...good, sub: 'someone-else' })).toString('base64url')}.${s}`;
    await expect(verifyJwt(tampered, hsCfg)).rejects.toThrow(/signature/);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(good)).toString('base64url')}.`;
    await expect(verifyJwt(none, hsCfg)).rejects.toThrow(/unsupported/);
  });
  it('authenticate() maps the token to a user; anon-role tokens are refused', async () => {
    const u = await authenticate({ token: signHs256(good, SECRET) }, hsCfg, new NullStore());
    expect(u).toEqual({ uid: UID, name: 'alice', admin: false });
    expect(await authenticate({ token: signHs256({ ...good, role: 'anon' }, SECRET) }, hsCfg, new NullStore())).toHaveProperty('error');
    expect(await authenticate({ name: 'Mallory' }, hsCfg, new NullStore())).toHaveProperty('error');
  });
});

describe('JWKS (ES256) tokens', () => {
  it('verifies against the project key set', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
    const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = enc({ alg: 'ES256', kid: 'k1', typ: 'JWT' }), body = enc({ sub: UID, aud: 'authenticated', exp: now + 600 });
    const sig = sign('SHA256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const cfg = authConfigFromEnv({ SUPABASE_URL: 'https://proj.supabase.co' });
    expect((await verifyJwt(`${head}.${body}.${sig}`, cfg)).sub).toBe(UID);
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const bad = sign('SHA256', Buffer.from(`${head}.${body}`), { key: other, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    await expect(verifyJwt(`${head}.${body}.${bad}`, cfg)).rejects.toThrow(/signature/);
  });
});

describe('DEV login', () => {
  it('accepts a sane display name and derives a stable id', async () => {
    const cfg = authConfigFromEnv({});
    expect(await authenticate({ name: '  Jan  Žižka ' }, cfg, new NullStore())).toEqual({ uid: 'dev-jan-žižka', name: 'Jan Žižka', admin: false });
    expect(await authenticate({ name: 'x' }, cfg, new NullStore())).toHaveProperty('error');
    expect(await authenticate({ name: '<script>' }, cfg, new NullStore())).toEqual({ uid: 'dev-script', name: 'script', admin: false });
  });
});
