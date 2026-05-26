'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const loginAsync = useAuthStore((s) => s.login);
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('请填写用户名和密码');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('两次密码不一致');
      return;
    }
    if (password.length < 3) {
      toast.error('密码至少 3 个字符');
      return;
    }
    const result = await register(username.trim(), email.trim(), password);
    if (result.ok) {
      await loginAsync(username.trim(), password);
      toast.success('注册成功！');
      router.push('/');
    } else {
      toast.error(result.error || '注册失败');
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050510]" />
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#050510] flex flex-col items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#050510] via-[#0a0a2e] to-[#0d0d1a]" />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(114, 46, 209, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(114, 46, 209, 0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <Link href="/" className="absolute top-6 left-6 z-10 flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm">
        <ChevronRight className="w-4 h-4 rotate-180" />
        返回首页
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl p-8">
          <div className="text-center mb-8">
            <div className="size-10 mx-auto mb-3 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-1">创建账号</h1>
            <p className="text-sm text-white/30">注册 AI 课程账号，开启智能学习之旅</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="设置用户名"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-purple-500/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">邮箱（可选）</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="输入邮箱"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-purple-500/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="设置密码"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-purple-500/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-purple-500/30 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-medium text-sm hover:shadow-[0_0_30px_rgba(114,46,209,0.3)] transition-all active:scale-95"
            >
              注册
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/30">
            已有账号？{' '}
            <Link href="/login" className="text-purple-400 hover:text-purple-300 transition-colors">
              立即登录
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
