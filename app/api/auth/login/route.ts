import { NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth-server';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: '请填写用户名和密码' }, { status: 400 });
    }

    const result = await loginUser(username, password);
    if (!result.ok || !result.token) {
      return NextResponse.json({ ok: false, error: result.error || '登录失败' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set('session_token', result.token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
