/**
 * Server-side auth helpers.
 * Stores user credentials (hashed) and sessions in JSON files under the
 * persistent data volume so they survive container restarts.
 */

import { randomBytes, pbkdf2Sync } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/* ─── data directory (mounted as a Docker volume) ─── */
const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

/* ─── helpers ─── */

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

/* ─── user model ─── */

export interface StoredUser {
  username: string;
  email: string;
  hash: string;   // PBKDF2 hex
  salt: string;
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || randomBytes(16).toString('hex');
  const h = pbkdf2Sync(password, s, 100000, 64, 'sha512').toString('hex');
  return { hash: h, salt: s };
}

/* ─── session model ─── */

interface Session {
  token: string;
  username: string;
  createdAt: number;
}

function makeToken(): string {
  return randomBytes(32).toString('hex');
}

/* ─── public API ─── */

export async function registerUser(
  username: string,
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const users = await readJSON<StoredUser[]>(USERS_FILE, []);
  if (users.some((u) => u.username === username)) {
    return { ok: false, error: '用户名已存在' };
  }
  const { hash, salt } = hashPassword(password);
  users.push({ username, email, hash, salt });
  await writeJSON(USERS_FILE, users);
  return { ok: true };
}

export async function loginUser(
  username: string,
  password: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const users = await readJSON<StoredUser[]>(USERS_FILE, []);
  const user = users.find((u) => u.username === username);
  if (!user) return { ok: false, error: '用户名或密码错误' };

  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.hash) return { ok: false, error: '用户名或密码错误' };

  const token = makeToken();
  const sessions = await readJSON<Session[]>(SESSIONS_FILE, []);
  sessions.push({ token, username, createdAt: Date.now() });
  await writeJSON(SESSIONS_FILE, sessions);

  return { ok: true, token };
}

export async function getSessionUser(
  token: string,
): Promise<{ username: string; email: string } | null> {
  const sessions = await readJSON<Session[]>(SESSIONS_FILE, []);
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;

  const users = await readJSON<StoredUser[]>(USERS_FILE, []);
  const user = users.find((u) => u.username === session.username);
  if (!user) return null;

  return { username: user.username, email: user.email };
}

export async function removeSession(token: string): Promise<void> {
  const sessions = await readJSON<Session[]>(SESSIONS_FILE, []);
  const filtered = sessions.filter((s) => s.token !== token);
  await writeJSON(SESSIONS_FILE, filtered);
}

export function getTokenFromCookies(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/session_token=([^;]+)/);
  return match ? match[1] : null;
}
