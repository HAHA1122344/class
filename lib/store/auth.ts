import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthState {
  isLoggedIn: boolean;
  username: string;
  email: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      username: '',
      email: '',
      hydrated: false,

      hydrate: async () => {
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated) {
              set({ isLoggedIn: true, username: data.user.username, email: data.user.email, hydrated: true });
              return;
            }
          }
        } catch {
          // not authenticated
        }
        set({ hydrated: true });
      },

      login: async (username, password) => {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json();
          if (data.ok) {
            set({ isLoggedIn: true, username });
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },

      register: async (username, email, password) => {
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
          });
          const data = await res.json();
          if (data.ok) {
            // Auto-login after register
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // ignore
        }
        set({ isLoggedIn: false, username: '', email: '' });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        username: state.username,
        email: state.email,
      }),
    },
  ),
);
