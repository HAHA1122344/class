import { NextResponse } from 'next/server';
import { getSessionUser, getTokenFromCookies } from '@/lib/auth-server';

export async function GET(request: Request) {
  const token = getTokenFromCookies(request);
  if (!token) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const user = await getSessionUser(token);
  if (!user) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, authenticated: true, user });
}
