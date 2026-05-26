import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth-server';

export async function POST(request: Request) {
  try {
    const { username, email, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: '请填写用户名和密码' }, { status: 400 });
    }
    if (username.length < 2) {
      return NextResponse.json({ ok: false, error: '用户名至少 2 个字符' }, { status: 400 });
    }
    if (password.length < 3) {
      return NextResponse.json({ ok: false, error: '密码至少 3 个字符' }, { status: 400 });
    }

    const result = await registerUser(username, email || '', password);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}
