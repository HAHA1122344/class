'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence, useInView } from 'motion/react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ImagePlus,
  Pencil,
  Trash2,
  Search,
  Settings,
  Sun,
  Moon,
  Monitor,
  ChevronUp,
  Upload,
  Sparkles,
  Atom,
  X,
  Bot,
  PenTool,
  Mic,
  Gamepad2,
  FileDown,
  Users,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { hasUsableLLMProvider } from '@/lib/store/settings-validation';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  renameStage,
  getFirstSlideByStages,
  revokeThumbnailSlideMediaUrls,
} from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { useAuthStore } from '@/lib/store/auth';
import { SpeechButton } from '@/components/audio/speech-button';
import { useImportClassroom } from '@/lib/import/use-import-classroom';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const INTERACTIVE_MODE_STORAGE_KEY = 'interactiveModeEnabled';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  webSearch: boolean;
  interactiveMode: boolean;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  webSearch: false,
  interactiveMode: false,
};

function HomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const userInitial = username ? username.charAt(0).toUpperCase() : '?';
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuDropdownRef = useRef<HTMLDivElement>(null);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // A usable LLM provider exists ⇒ a concrete model is always selected (#580
  // invariant). Gate generation on this single condition (state A vs B)
  // instead of inspecting modelId directly.
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const hasUsableProvider = hasUsableLLMProvider(providersConfig);
  const [recentOpen, setRecentOpen] = useState(true);
  const persistRecentOpen = (next: boolean) => {
    setRecentOpen(next);
    try {
      localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  // Hydrate client-only state after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedInteractiveMode = localStorage.getItem(INTERACTIVE_MODE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedInteractiveMode === 'true') updates.interactiveMode = true;
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore requirement draft from localStorage on mount. The previous derived-state
  // pattern initialised `prev` from the cached value itself, so on the first client
  // render the comparison was always equal and the restore never fired. Use an effect
  // so the cache is hydrated into the form once we know the live requirement is empty.
  const draftRestoredRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!cachedRequirement) return;
    draftRestoredRef.current = true;
    setForm((prev) => (prev.requirement ? prev : { ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [themeOpen, setThemeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thumbnailsRef = useRef<Record<string, Slide>>({});
  const quickStartRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: '-100px' });


  const replaceThumbnails = (slides: Record<string, Slide>) => {
    const previous = thumbnailsRef.current;
    thumbnailsRef.current = slides;
    setThumbnails(slides);
    window.setTimeout(() => revokeThumbnailSlideMediaUrls(previous), 0);
  };

  // ─── Theme dropdown outside-click handler ───
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const loadClassrooms = async () => {
    try {
      const list = await listStages();
      setClassrooms(list);
      // Load first slide thumbnails
      if (list.length > 0) {
        const slides = await getFirstSlideByStages(list.map((c) => c.id));
        replaceThumbnails(slides);
      } else {
        replaceThumbnails({});
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  const { importing, fileInputRef, triggerFileSelect, handleFileChange } = useImportClassroom(
    () => {
      loadClassrooms();
    },
  );

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Store hydration on mount
    loadClassrooms();

    return () => {
      revokeThumbnailSlideMediaUrls(thumbnailsRef.current);
      thumbnailsRef.current = {};
    };
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredClassrooms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter((c) => {
      const name = c.name?.toLowerCase() ?? '';
      const desc = c.description?.toLowerCase() ?? '';
      return name.includes(q) || desc.includes(q);
    });
  }, [classrooms, deferredSearchQuery]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'interactiveMode')
        localStorage.setItem(INTERACTIVE_MODE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const handleGenerate = async () => {
    // No model/provider guard here: generation is gated by `canGenerate`
    // (requires a usable provider), and under the #580 invariant a usable
    // provider always has a concrete model. State A (no usable provider)
    // surfaces through the toolbar's single Configure-Provider affordance.
    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        interactiveMode: form.interactiveMode,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim() && hasUsableProvider;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#050510] flex flex-col items-center overflow-x-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* ═══ Top-right pill (unchanged) ═══ */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══════════════════════════════════════════════════════════════
         NEW: Futuristic Sections
      ═══════════════════════════════════════════════════════════════ */}

      {/* ─── Particle Background ─── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#050510] via-[#0a0a2e] to-[#0d0d1a]" />
        {/* Grid lines */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(114, 46, 209, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(114, 46, 209, 0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Floating particles - use static seed to avoid hydration mismatch */}
        {useMemo(() => {
          const seed = Array.from({ length: 20 }, (_, i) => ({
            width: ((i * 3.7 + 1.2) % 4) + 1,
            height: ((i * 2.1 + 3.4) % 4) + 1,
            left: ((i * 7.3 + 0.5) % 100),
            bottom: ((i * 4.9 + 1.8) % 20),
            color: i % 3 === 0,
            duration: ((i * 5.1 + 2.7) % 15) + 10,
            delay: ((i * 3.3 + 0.9) % 10),
          }));
          return seed.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${p.width}px`,
                height: `${p.height}px`,
                left: `${p.left}%`,
                bottom: `${p.bottom}%`,
                background: p.color ? 'rgba(114, 46, 209, 0.6)' : 'rgba(6, 182, 212, 0.4)',
                animation: `float ${p.duration}s linear infinite`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ));
        }, [])}
        {/* Glowing orbs */}
        <div
          className="absolute -top-40 -left-40 w-80 h-80 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(114,46,209,0.4) 0%, transparent 70%)',
            animation: 'glow-pulse 6s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)',
            animation: 'glow-pulse 8s ease-in-out infinite',
            animationDelay: '2s',
          }}
        />
      </div>

      {/* ─── Top Navigation Bar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-black/40 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <span className="text-white/90 font-semibold text-sm tracking-wide">开智课程</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                quickStartRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
            >
              开始创建
            </button>
            <button
              onClick={() => {
                featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
            >
              功能介绍
            </button>
            <div className="hidden md:flex items-center gap-1">
              {isLoggedIn ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white/90 hover:bg-white/5 transition-all"
                  >
                    <div className="size-5 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold">
                        {userInitial}
                      </span>
                    </div>
                    <span>{username}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {userMenuOpen && (
                    <div
                      ref={userMenuDropdownRef}
                      className="absolute top-full mt-2 right-0 bg-gray-900 border border-white/10 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]"
                    >
                      <div className="px-3 py-2 text-xs text-white/40 border-b border-white/5">
                        已登录
                      </div>
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="w-full px-3 py-2 text-left text-xs text-white/60 hover:bg-white/5 transition-colors"
                      >
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-3 py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
                  >
                    登录
                  </Link>
                  <Link
                    href="/register"
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-xs font-medium hover:shadow-[0_0_20px_rgba(114,46,209,0.3)] transition-all"
                  >
                    注册
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 pl-2 border-l border-white/10">
              <LanguageSwitcher />
              <div ref={themeDropdownRef} className="relative">
                <button
                  onClick={() => setThemeOpen(!themeOpen)}
                  className="p-1.5 rounded-full text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
                >
                  {theme === 'light' && <Sun className="w-3.5 h-3.5" />}
                  {theme === 'dark' && <Moon className="w-3.5 h-3.5" />}
                  {theme === 'system' && <Monitor className="w-3.5 h-3.5" />}
                </button>
                {themeOpen && (
                  <div className="absolute top-full mt-2 right-0 bg-gray-900 border border-white/10 rounded-lg shadow-lg overflow-hidden z-50 min-w-[120px]">
                    <button
                      onClick={() => { setTheme('light'); setThemeOpen(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <Sun className="w-3 h-3" /> 浅色
                    </button>
                    <button
                      onClick={() => { setTheme('dark'); setThemeOpen(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <Moon className="w-3 h-3" /> 深色
                    </button>
                    <button
                      onClick={() => { setTheme('system'); setThemeOpen(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <Monitor className="w-3 h-3" /> 跟随系统
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-1.5 rounded-full text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="text-center max-w-4xl"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs mb-6"
          >
            <Sparkles className="w-3 h-3" />
            基于 AI 多智能体的智能课堂
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
          >
            <span className="text-white">AI 智能课堂</span>
            <br />
            <span className="gradient-text">一键生成</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-base md:text-lg text-white/40 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            输入任意主题或上传资料，AI 自动生成完整的互动课堂
            <br className="hidden md:block" />
            配备 AI 教师、AI 同学，支持实时讨论与交互式学习
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex items-center justify-center gap-4"
          >
            <button
              onClick={() => quickStartRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-medium text-sm transition-all hover:shadow-[0_0_30px_rgba(114,46,209,0.4)] active:scale-95"
            >
              开始创建
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                  animation: 'shimmer-vertical 2s infinite',
                }}
              />
            </button>
            <button
              onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="px-6 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white/80 hover:border-white/20 text-sm transition-all"
            >
              功能介绍
            </button>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="absolute bottom-8 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] text-white/20 tracking-widest uppercase">向下滚动</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="w-4 h-4 text-white/20" />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Features Section ─── */}
      <section ref={featuresRef} className="relative z-10 py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">核心功能</h2>
            <p className="text-sm text-white/30 max-w-xl mx-auto">
              强大的 AI 多智能体技术，让学习变得更加高效和有趣
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Users,
                title: '多智能体课堂',
                desc: 'AI 教师授课 + AI 同学讨论，营造真实的互动学习氛围',
                gradient: 'from-purple-500/20 to-purple-500/5',
                border: 'hover:border-purple-500/30',
              },
              {
                icon: Sparkles,
                title: '一键生成课件',
                desc: '输入主题或上传 PDF，AI 自动生成完整课程大纲和课件',
                gradient: 'from-cyan-500/20 to-cyan-500/5',
                border: 'hover:border-cyan-500/30',
              },
              {
                icon: PenTool,
                title: '智能白板',
                desc: '实时绘图、公式书写、思维导图，直观展示教学内容',
                gradient: 'from-violet-500/20 to-violet-500/5',
                border: 'hover:border-violet-500/30',
              },
              {
                icon: Mic,
                title: '语音交互',
                desc: 'TTS 语音讲解 + ASR 语音输入，多感官沉浸式学习',
                gradient: 'from-blue-500/20 to-blue-500/5',
                border: 'hover:border-blue-500/30',
              },
              {
                icon: Gamepad2,
                title: '交互式学习',
                desc: '3D 可视化、编程仿真、互动游戏，动手实践加深理解',
                gradient: 'from-emerald-500/20 to-emerald-500/5',
                border: 'hover:border-emerald-500/30',
              },
              {
                icon: FileDown,
                title: '多格式导出',
                desc: '支持 PPTX / HTML / ZIP 等多种格式，随时随地学习',
                gradient: 'from-orange-500/20 to-orange-500/5',
                border: 'hover:border-orange-500/30',
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="relative group"
              >
                <div
                  className={`relative rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl p-5 overflow-hidden transition-all duration-300 hover:scale-[1.02] ${feature.border} hover:shadow-[0_0_30px_rgba(114,46,209,0.08)]`}
                >
                  {/* Gradient bg on hover */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />
                  <div className="relative z-10">
                    <div className="size-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                      <feature.icon className="w-5 h-5 text-white/60" />
                    </div>
                    <h3 className="text-sm font-semibold text-white/90 mb-1.5">{feature.title}</h3>
                    <p className="text-xs text-white/40 leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Download App Section ─── */}
      <section className="relative z-10 py-16 md:py-24 px-4 w-full">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900/40 via-slate-900/60 to-cyan-900/30 border border-white/[0.08] p-8 md:p-12"
          >
            {/* Background glow */}
            <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-purple-500/10 blur-[80px]" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-cyan-500/10 blur-[80px]" />

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 text-center md:text-left">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 text-xs mb-4"
                >
                  <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
                  移动端已就绪
                </motion.div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  下载 AI 课程 App
                </h3>
                <p className="text-sm text-white/40 max-w-md leading-relaxed mb-6">
                  随时随地学习，离线访问课程内容
                  <br />
                  支持 Android 平台，手机和平板均可使用
                </p>
                <a
                  href="/AIclass.apk"
                  download
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-white/90 transition-all active:scale-95 shadow-lg"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.523 16.397c-.497.738-1.063 1.486-1.918 1.502-.854.015-1.13-.507-2.106-.507-.976 0-1.28.49-2.087.523-.807.032-1.423-.798-1.923-1.532-1.047-1.513-1.848-4.277-.773-6.146.534-.93 1.488-1.518 2.522-1.533.79-.015 1.536.533 2.02.533.483 0 1.387-.66 2.338-.563.398.016 1.515.16 2.232 1.203-.058.036-1.332.778-1.318 2.322.014 1.844 1.616 2.458 1.634 2.466-.014.046-.256.875-.84 1.733zM14.15 5.758c.432-.542.746-1.294.652-2.058-.63.027-1.4.434-1.85.976-.407.484-.762 1.244-.666 1.977.704.056 1.42-.372 1.864-.895z"/>
                  </svg>
                  Android APK 下载
                  <span className="text-xs text-black/50">(3.5 MB)</span>
                </a>
              </div>
              <div className="shrink-0">
                <div className="relative size-40 md:size-48">
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 blur-xl" />
                  <div className="relative size-full rounded-3xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
                    <div className="text-center">
                      <div className="size-12 mx-auto mb-2 rounded-xl bg-white/20 flex items-center justify-center">
                        <span className="text-white text-xl font-bold">AI</span>
                      </div>
                      <p className="text-white/90 font-semibold text-sm">AI 课程</p>
                      <p className="text-white/40 text-[10px] mt-0.5">v1.0 · Android</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ QUICK START: Futuristic command center ═══ */}
      <section className="relative z-10 w-full px-4 py-8 md:px-8 md:pb-16 flex flex-col items-center">

      <motion.div
        ref={quickStartRef}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[900px] flex flex-col items-center',
          classrooms.length === 0 ? 'justify-center min-h-[calc(100dvh-8rem)]' : 'mt-[10vh]',
        )}
      >
        {/* ── Section header ── */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs mb-4"
          >
            <Sparkles className="w-3 h-3" />
            快速创建
          </motion.div>
          <h3 className="text-xl md:text-2xl text-white/90 font-semibold mb-2">
            你的灵感，AI 来创造
          </h3>
          <p className="text-sm text-white/30 max-w-lg mx-auto leading-relaxed">
            只需一个主题，AI 自动生成完整的互动课堂
            <br />
            配备 AI 教师与智能助教，让学习充满想象
          </p>
        </div>

        {/* ── Profile & Agents bar ── */}
        <div className="w-full flex items-center justify-between mb-4">
          <GreetingBar />
          <AgentBar />
        </div>

        {/* ── Input panel with animated glow ring ── */}
        <div className="relative w-full group">
          {/* Animated glow ring */}
          <div
            className="absolute -inset-[1.5px] rounded-2xl opacity-0 group-focus-within:opacity-100 group-hover:opacity-60 transition-all duration-700"
            style={{
              background:
                'linear-gradient(135deg, rgba(114,46,209,0.5), rgba(6,182,212,0.3), rgba(114,46,209,0.5))',
              backgroundSize: '200% 200%',
              animation: 'gradient-flow 4s ease infinite',
              filter: 'blur(4px)',
            }}
          />
          <div className="relative rounded-2xl bg-[#070714] border border-white/[0.07] transition-all duration-300 focus-within:border-purple-500/30">
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={t('upload.requirementPlaceholder')}
              className="w-full resize-none border-0 bg-transparent px-5 pt-5 pb-3 text-sm leading-relaxed text-white/80 placeholder:text-white/20 focus:outline-none min-h-[120px] max-h-[300px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />

            {/* Bottom bar: tools + actions */}
            <div className="flex items-center gap-2 px-3 pb-3 pt-2 border-t border-white/[0.04]">
              <div className="flex-1 min-w-0">
                <GenerationToolbar
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={form.pdfFile}
                  onPdfFileChange={(f) => updateForm('pdfFile', f)}
                  onPdfError={setError}
                />
              </div>

              {/* Interactive mode toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    onClick={() => updateForm('interactiveMode', !form.interactiveMode)}
                    className={cn(
                      'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap border shrink-0 h-8',
                      form.interactiveMode
                        ? 'bg-cyan-900/30 text-cyan-300 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                        : 'border-white/10 text-white/40 hover:text-white/60 hover:border-white/20',
                    )}
                  >
                    {form.interactiveMode && (
                      <span
                        className="absolute inset-[-4px] rounded-full border border-cyan-400/25"
                        style={{
                          animation: 'interactive-mode-breathe 2s ease-in-out infinite',
                        }}
                      />
                    )}
                    <Atom className="size-3.5 relative z-10 animate-[spin_3s_linear_infinite]" />
                    <span className="relative z-10">{t('toolbar.interactiveModeLabel')}</span>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {t('toolbar.interactiveModeHint')}
                </TooltipContent>
              </Tooltip>

              {/* Voice input */}
              <SpeechButton
                size="md"
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Send button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-4',
                  canGenerate
                    ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:shadow-[0_0_25px_rgba(114,46,209,0.3)] cursor-pointer active:scale-95'
                    : 'bg-white/5 text-white/20 cursor-not-allowed',
                )}
              >
                <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Import button (empty state) ── */}
        {classrooms.length === 0 && (
          <button
            onClick={triggerFileSelect}
            disabled={importing}
            className="relative z-10 mt-4 flex items-center gap-1.5 text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            <Upload className="size-3.5" />
            <span>{t('import.classroom')}</span>
          </button>
        )}
      </motion.div>

      {/* ═══ Recent classrooms — collapsible ═══ */}
      {classrooms.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Trigger — divider-line with centered text */}
          <div className="group w-full flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <div className="shrink-0 flex items-center gap-3 text-[13px] text-muted-foreground/60 select-none">
              <button
                onClick={() => persistRecentOpen(!recentOpen)}
                className="flex items-center gap-2 hover:text-foreground/70 transition-colors cursor-pointer"
              >
                <Clock className="size-3.5" />
                {t('classroom.recentClassrooms')}
                <span className="text-[11px] tabular-nums opacity-60">{classrooms.length}</span>
                <motion.div
                  animate={{ rotate: recentOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <ChevronDown className="size-3.5" />
                </motion.div>
              </button>

              {/* Search toggle — icon that expands into an input in place */}
              <AnimatePresence initial={false}>
                {!searchOpen ? (
                  <motion.button
                    key="search-icon"
                    ref={searchButtonRef}
                    type="button"
                    aria-label={t('classroom.searchAriaLabel')}
                    onClick={() => {
                      setSearchOpen(true);
                      if (!recentOpen) persistRecentOpen(true);
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    className="flex items-center justify-center size-6 rounded-full text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <Search className="size-3.5" />
                  </motion.button>
                ) : (
                  <motion.div
                    key="search-input"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 200 }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <InputGroup
                      className={cn(
                        'h-7 text-[12px] rounded-full bg-muted/40 border-transparent shadow-none',
                        'transition-colors',
                        'hover:bg-muted/60',
                        'has-[[data-slot=input-group-control]:focus-visible]:bg-muted/60',
                        'has-[[data-slot=input-group-control]:focus-visible]:border-transparent',
                        'has-[[data-slot=input-group-control]:focus-visible]:ring-0',
                      )}
                    >
                      <InputGroupInput
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            if (searchQuery) {
                              setSearchQuery('');
                            } else {
                              setSearchOpen(false);
                              requestAnimationFrame(() => searchButtonRef.current?.focus());
                            }
                          }
                        }}
                        onBlur={() => {
                          if (!searchQuery) {
                            setSearchOpen(false);
                          }
                        }}
                        placeholder={t('classroom.searchPlaceholder')}
                        aria-label={t('classroom.searchAriaLabel')}
                        className="h-7 pl-3 placeholder:text-muted-foreground/50"
                      />
                      {searchQuery && (
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={t('classroom.clearSearch')}
                          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                        >
                          <X />
                        </InputGroupButton>
                      )}
                    </InputGroup>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={triggerFileSelect}
                disabled={importing}
                className="group/import grid grid-cols-[auto_0fr] hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-muted/50 transition-all duration-200 cursor-pointer"
              >
                <Upload className="size-3" />
                <span className="overflow-hidden opacity-0 group-hover/import:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                  {t('import.classroom')}
                </span>
              </button>
            </div>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </div>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                {searchQuery.trim() && filteredClassrooms.length === 0 ? (
                  <div className="pt-8 pb-2 text-center text-[13px] text-muted-foreground/60">
                    {t('classroom.searchEmpty')}
                  </div>
                ) : (
                  <div className="pt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                    {filteredClassrooms.map((classroom, i) => (
                      <motion.div
                        key={classroom.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.04,
                          duration: 0.35,
                          ease: 'easeOut',
                        }}
                      >
                        <ClassroomCard
                          classroom={classroom}
                          slide={thumbnails[classroom.id]}
                          formatDate={formatDate}
                          onDelete={handleDelete}
                          onRename={handleRename}
                          confirmingDelete={pendingDeleteId === classroom.id}
                          onConfirmDelete={() => confirmDelete(classroom.id)}
                          onCancelDelete={() => setPendingDeleteId(null)}
                          onClick={() => router.push(`/classroom/${classroom.id}`)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      </section>

      {/* ─── New Footer ─── */}
      <footer className="relative z-10 w-full border-t border-white/[0.05] py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">AI</span>
            </div>
            <span className="text-xs text-white/20">开智课程 · 开源 AI 互动课堂</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-white/20">
            <span>基于多智能体技术</span>
            <span className="w-1 h-1 rounded-full bg-white/10" />
            <span>MIT 开源协议</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('profile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div
          className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40 transition-all duration-300">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="leading-none select-none flex items-center gap-1">
                  <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                    {t('home.greetingWithName', { name: displayName })}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-violet-300/70 dark:ring-violet-500/40 transition-all duration-300">
                    <img src={avatar} alt="" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {classroom.interactiveMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={t('toolbar.interactiveModeLabel')}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-2 left-2 inline-flex items-center justify-center size-5 rounded-full bg-white/70 dark:bg-slate-900/60 text-cyan-600 dark:text-cyan-300 backdrop-blur-sm shadow-sm ring-1 ring-cyan-500/30 z-10"
              >
                <Atom className="size-3" />
              </span>
            </TooltipTrigger>
            {/* Negative sideOffset compensates for the global Tooltip Arrow's
                rotate-45 bounding box, which Radix reserves as spacing. */}
            <TooltipContent
              side="top"
              align="start"
              sideOffset={-4}
              collisionPadding={0}
              className="text-xs"
            >
              {t('toolbar.interactiveModeLabel')}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-11 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={startRename}
              >
                <Pencil className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail */}
      <div className="mt-2.5 px-1 flex items-center gap-2">
        <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        {editing ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commitRename}
              maxLength={100}
              placeholder={t('classroom.renamePlaceholder')}
              className="w-full bg-transparent border-b border-violet-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="font-medium text-[15px] truncate text-foreground/90 min-w-0 cursor-text"
                onDoubleClick={startRename}
              >
                {classroom.name}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={4}
              className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
            >
              <div className="flex items-center gap-1.5">
                <span className="break-all">{classroom.name}</span>
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(classroom.name);
                    toast.success(t('classroom.nameCopied'));
                  }}
                >
                  <Copy className="size-3 opacity-60" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}


export default function Page() {
  return <HomePage />;
}
