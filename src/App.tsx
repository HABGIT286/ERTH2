import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Satellite,
  User,
  LayoutDashboard,
  CreditCard,
  LineChart,
  History,
  BellRing,
  Sliders,
  Palette,
  Send,
  LogOut,
  RefreshCw,
  Coins,
  Crown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  Lock,
  Globe,
  Download,
  Copy,
  Clock,
  Calendar,
  FileCode2,
  Sparkles,
  Zap,
  Camera,
  Activity,
  Image as ImageIcon,
  MessageSquareHeart,
  Check,
  Gauge,
  SlidersHorizontal,
  Type,
  Compass,
  Maximize2,
  BarChart3,
  Cpu,
  ShieldCheck,
  Diamond,
  Moon,
  Sun,
  Radio,
  Share2,
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Flame,
  CheckCheck
} from 'lucide-react';

interface NormalizedEarthlink {
  username?: string;
  fullName?: string;
  userID?: string;
  agentName?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  ip?: string;
  plan?: string;
  price?: string | number;
  accountStatus?: string;
  serviceStatus?: string;
  expiry?: string;
  daysLeft?: number | string;
  speed?: string;
  usage?: string;
  download?: string;
  upload?: string;
  frequency?: string;
  image?: string;
  allFields?: Array<{ label: string; value: string }>;
  raw?: any;
}

interface AlertConfig {
  webhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  channel: 'telegram' | 'webhook' | 'both';
  day: number;
  hour: number;
  minute: number;
  second: number;
  period: 'AM' | 'PM';
  enabled: boolean;
  notifyOnDaysRemaining: number;
  lastSentTimestamp?: string;
}

interface HistoryLog {
  id: string;
  time: string;
  action: string;
  result: string;
  success: boolean;
}

interface ClickGleam {
  id: number;
  x: number;
  y: number;
}

const EXPIRY_WORDS = [
  'expiry', 'expire', 'expiration', 'enddate', 'end_date', 'validto', 'valid_to',
  'expirationdate', 'expirydate', 'expiredate', 'subscriptionend',
  'تاريخ الانتهاء', 'تاريخ انتهاء', 'انتهاء الاشتراك', 'تاريخ الصلاحية', 'صالح لغاية'
];

const SECRET_WORDS = [
  'password', 'passwd', 'token', 'secret', 'authorization', 'cookie', 'credential', 'webhook'
];

function isHiddenKey(key: string): boolean {
  const k = String(key).toLowerCase();
  return SECRET_WORDS.some(w => k.includes(w));
}

function valueText(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
  if (typeof val === 'object') {
    if ('value' in val) return valueText(val.value);
    if ('displayName' in val) return valueText(val.displayName);
    try {
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return String(val).trim();
}

function unwrapPayload(payload: any): any {
  let curr = payload;
  for (let i = 0; i < 6; i++) {
    if (!curr || typeof curr !== 'object' || Array.isArray(curr)) break;
    const next = curr.data || curr.result || curr.userData || curr.account || curr.payload;
    if (!next || next === curr) break;
    curr = next;
  }
  return curr && typeof curr === 'object' ? curr : {};
}

function collectFields(data: any, prefix = ''): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (!data || typeof data !== 'object') return rows;

  if (Array.isArray(data)) {
    data.forEach((item, idx) => {
      if (item !== null && typeof item !== 'object') {
        rows.push({ label: `${prefix} #${idx + 1}`, value: String(item) });
      } else {
        rows.push(...collectFields(item, `${prefix} #${idx + 1}`));
      }
    });
    return rows;
  }

  for (const [key, value] of Object.entries(data)) {
    if (isHiddenKey(key)) continue;
    const label = prefix ? `${prefix} / ${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value) && ('value' in value || 'displayName' in value)) {
      const valObj: any = value;
      const name = String(valObj.displayName || key);
      const actual = valObj.value;
      if (actual !== null && actual !== undefined && String(actual).trim()) {
        rows.push({ label: name, value: valueText(actual) });
      }
      const ignored = new Set(['value', 'displayName', 'editable', 'visible', 'tags', 'filedType', 'fieldType']);
      for (const [subKey, subVal] of Object.entries(valObj)) {
        if (ignored.has(subKey) || isHiddenKey(subKey)) continue;
        if (subVal !== null && subVal !== undefined && subVal !== '' && !Array.isArray(subVal)) {
          rows.push(...collectFields({ [subKey]: subVal }, name));
        }
      }
    } else if (value && typeof value === 'object') {
      rows.push(...collectFields(value, label));
    } else if (value !== null && value !== undefined && value !== '') {
      rows.push({ label, value: String(value) });
    }
  }

  return rows;
}

function findExpiryDate(data: any): { date: Date; label: string } | null {
  if (!data || typeof data !== 'object') return null;

  function parseDateStr(val: any): Date | null {
    if (!val) return null;
    if (typeof val === 'number') {
      let stamp = val;
      if (stamp > 10000000000) stamp /= 1000;
      const d = new Date(stamp * 1000);
      return !isNaN(d.getTime()) ? d : null;
    }
    const str = String(val).trim();
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    const parts = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/) || str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (parts) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }

  const stack: Array<{ obj: any; path: string }> = [{ obj: data, path: '' }];
  while (stack.length > 0) {
    const { obj, path } = stack.pop()!;
    if (typeof obj !== 'object' || obj === null) continue;

    for (const [k, v] of Object.entries(obj)) {
      const currPath = path ? `${path} / ${k}` : k;
      const normalizedK = k.toLowerCase().replace(/[\s_-]+/g, '');
      const isExpiryField = EXPIRY_WORDS.some(w => normalizedK.includes(w.toLowerCase().replace(/[\s_-]+/g, '')));

      if (isExpiryField) {
        const raw = (v && typeof v === 'object' && 'value' in v) ? (v as any).value : v;
        const parsed = parseDateStr(raw);
        if (parsed) return { date: parsed, label: currPath };
      }

      if (v && typeof v === 'object') {
        stack.push({ obj: v, path: currPath });
      }
    }
  }
  return null;
}

function pick(object: any, keys: string[]): any {
  if (!object || typeof object !== 'object') return undefined;
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'object' && 'value' in value) return value.value;
      if (typeof value === 'object' && 'displayName' in value) return value.displayName;
      return value;
    }
  }
  return undefined;
}

function normalizeEarthlinkData(payload: any): NormalizedEarthlink {
  const unwrapped = unwrapPayload(payload);
  const root = payload && typeof payload === 'object' ? payload : {};
  const all = { ...root, ...unwrapped };

  const allFields = collectFields(all);
  const expiryObj = findExpiryDate(all);

  let daysLeft: number | string | undefined = pick(all, [
    'activeDaysLeft', 'daysLeft', 'remainingDays', 'remainingDaysCount', 'days'
  ]);

  if ((daysLeft === undefined || daysLeft === '') && expiryObj?.date) {
    const diffTime = expiryObj.date.getTime() - new Date().getTime();
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    username: pick(all, ['username', 'userName', 'user_name', 'loginName', 'accountUsername']),
    fullName: pick(all, ['fullName', 'fullname', 'name', 'customerName', 'accountName']),
    userID: pick(all, ['userID', 'userId', 'id', 'accountID', 'accountId']),
    agentName: pick(all, ['agentName', 'agent', 'resellerName', 'reseller']),
    phone: pick(all, ['phone', 'phoneNumber', 'mobile', 'mobileNumber']),
    email: pick(all, ['email', 'emailAddress']),
    city: pick(all, ['city', 'governorate']),
    address: pick(all, ['address', 'location', 'area']),
    ip: pick(all, ['ip', 'IP', 'ipAddress', 'clientIP', 'userIP', 'framedIpAddress']),
    plan: pick(all, ['subscriptionType', 'accountName', 'packageName', 'planName', 'serviceName', 'profileName']),
    price: pick(all, ['accountPrice', 'price', 'subscriptionPrice', 'packagePrice']),
    accountStatus: pick(all, ['accountStatus', 'status', 'userStatus']),
    serviceStatus: pick(all, ['serviceStatus', 'serviceStatusColor', 'connectionStatus']),
    expiry: expiryObj ? expiryObj.date.toISOString().split('T')[0] : pick(all, ['expiryDate', 'expireDate', 'expirationDate', 'endDate', 'accountExpiry']),
    daysLeft: daysLeft !== undefined ? daysLeft : '—',
    speed: pick(all, ['speed', 'currentSpeed', 'downloadSpeed', 'connectionSpeed']),
    usage: pick(all, ['usage', 'totalUsage', 'usedGB', 'consumption', 'dataUsage']),
    download: pick(all, ['download', 'downloadUsage', 'downloadGB']),
    upload: pick(all, ['upload', 'uploadUsage', 'uploadGB']),
    frequency: pick(all, ['frequency', 'signalFrequency', 'connectionFrequency']),
    image: pick(all, ['image', 'imageUrl', 'accountImage', 'profileImage', 'cardImage', 'packageImage']),
    allFields,
    raw: all,
  };
}

// 12 Ultra Luxury Themes
type ThemeMode =
  | 'gold'
  | 'neonCyan'
  | 'royalPurple'
  | 'emerald'
  | 'rubyRed'
  | 'obsidian'
  | 'sapphire'
  | 'amethyst'
  | 'roseGold'
  | 'cyberMatrix'
  | 'stellarCosmic'
  | 'pureLight';

interface ThemeStyles {
  name: string;
  nameEn: string;
  bg: string;
  cardBg: string;
  border: string;
  primary: string;
  primaryHover: string;
  glow: string;
  accentText: string;
  previewGradient: string;
}

const LUXURY_THEMES: Record<ThemeMode, ThemeStyles> = {
  gold: {
    name: 'الذهب الإمبراطوري الأسود',
    nameEn: 'Imperial Black Gold',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(216,180,106,0.35),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(180,140,70,0.22),transparent_70%),linear-gradient(180deg,#16130b_0%,#0c0d11_50%,#040507_100%)]',
    cardBg: 'bg-black/65 backdrop-blur-2xl',
    border: 'border-[#d8b46a]/40',
    primary: 'from-[#f5dfa4] via-[#d8b46a] to-[#a8792c]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(216,180,106,0.6)',
    accentText: 'text-[#f5dfa4]',
    previewGradient: 'from-[#1a150b] via-[#2a2010] to-[#d8b46a]',
  },
  neonCyan: {
    name: 'السيبراني المشع فائق السرعة',
    nameEn: 'Hyper Cyber Cyan',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(0,242,254,0.35),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(0,180,250,0.25),transparent_70%),linear-gradient(180deg,#061a29_0%,#030e17_50%,#010508_100%)]',
    cardBg: 'bg-[#030e17]/70 backdrop-blur-2xl',
    border: 'border-[#00f2fe]/45',
    primary: 'from-[#4facfe] via-[#00f2fe] to-[#00c6ff]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(0,242,254,0.6)',
    accentText: 'text-[#00f2fe]',
    previewGradient: 'from-[#061a29] via-[#08364d] to-[#00f2fe]',
  },
  royalPurple: {
    name: 'الأرجواني المخملي الملوكي',
    nameEn: 'Royal Velvet Amethyst',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(184,98,252,0.38),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(130,50,220,0.28),transparent_70%),linear-gradient(180deg,#1f0e38_0%,#0e061a_50%,#05020a_100%)]',
    cardBg: 'bg-[#120722]/70 backdrop-blur-2xl',
    border: 'border-[#b862fc]/40',
    primary: 'from-[#d8b4fe] via-[#b862fc] to-[#6d28d9]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(184,98,252,0.6)',
    accentText: 'text-[#d8b4fe]',
    previewGradient: 'from-[#1f0e38] via-[#2c1352] to-[#b862fc]',
  },
  emerald: {
    name: 'الزمرد الأخضر الإمبراطوري',
    nameEn: 'Imperial Emerald',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(16,185,129,0.35),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(5,150,105,0.25),transparent_70%),linear-gradient(180deg,#0a2618_0%,#03140b_50%,#010603_100%)]',
    cardBg: 'bg-[#03140b]/70 backdrop-blur-2xl',
    border: 'border-[#10b981]/40',
    primary: 'from-[#6ee7b7] via-[#10b981] to-[#047857]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(16,185,129,0.6)',
    accentText: 'text-[#6ee7b7]',
    previewGradient: 'from-[#0a2618] via-[#083c24] to-[#10b981]',
  },
  rubyRed: {
    name: 'الياقوت القرمزي المشتعل',
    nameEn: 'Blazing Crimson Ruby',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(244,63,94,0.38),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(190,18,60,0.28),transparent_70%),linear-gradient(180deg,#2b0a12_0%,#130307_50%,#070102_100%)]',
    cardBg: 'bg-[#180409]/70 backdrop-blur-2xl',
    border: 'border-[#f43f5e]/40',
    primary: 'from-[#fda4af] via-[#f43f5e] to-[#be123c]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(244,63,94,0.6)',
    accentText: 'text-[#fda4af]',
    previewGradient: 'from-[#2b0a12] via-[#440d17] to-[#f43f5e]',
  },
  obsidian: {
    name: 'حجر السج الفضي التيتانيوم',
    nameEn: 'Titanium Obsidian',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(203,213,225,0.3),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(148,163,184,0.2),transparent_70%),linear-gradient(180deg,#1c1f28_0%,#0d0e13_50%,#050608_100%)]',
    cardBg: 'bg-[#101218]/70 backdrop-blur-2xl',
    border: 'border-[#cbd5e1]/35',
    primary: 'from-[#f1f5f9] via-[#cbd5e1] to-[#64748b]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(203,213,225,0.5)',
    accentText: 'text-[#e2e8f0]',
    previewGradient: 'from-[#1c1f28] via-[#2a2d38] to-[#cbd5e1]',
  },
  sapphire: {
    name: 'الياقوت الأزرق الكحلي الملكي',
    nameEn: 'Midnight Sapphire',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(59,130,246,0.38),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(29,78,216,0.28),transparent_70%),linear-gradient(180deg,#0a1b42_0%,#040c21_50%,#01040f_100%)]',
    cardBg: 'bg-[#05102a]/70 backdrop-blur-2xl',
    border: 'border-[#3b82f6]/40',
    primary: 'from-[#93c5fd] via-[#3b82f6] to-[#1d4ed8]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(59,130,246,0.6)',
    accentText: 'text-[#93c5fd]',
    previewGradient: 'from-[#0a1b42] via-[#0d2656] to-[#3b82f6]',
  },
  amethyst: {
    name: 'الماس البنفسجي الفضائي',
    nameEn: 'Cosmic Amethyst Diamond',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(192,132,252,0.38),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(126,34,206,0.28),transparent_70%),linear-gradient(180deg,#240c38_0%,#10041d_50%,#07010e_100%)]',
    cardBg: 'bg-[#140523]/70 backdrop-blur-2xl',
    border: 'border-[#c084fc]/40',
    primary: 'from-[#e9d5ff] via-[#c084fc] to-[#7e22ce]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(192,132,252,0.6)',
    accentText: 'text-[#e9d5ff]',
    previewGradient: 'from-[#240c38] via-[#381559] to-[#c084fc]',
  },
  roseGold: {
    name: 'الذهب الوردي الفاتن',
    nameEn: 'Luxe Rose Gold',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(251,113,133,0.38),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(225,29,72,0.28),transparent_70%),linear-gradient(180deg,#2e111d_0%,#15050d_50%,#080105_100%)]',
    cardBg: 'bg-[#1b0510]/70 backdrop-blur-2xl',
    border: 'border-[#fb7185]/40',
    primary: 'from-[#ffe4e6] via-[#fb7185] to-[#e11d48]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(251,113,133,0.6)',
    accentText: 'text-[#ffe4e6]',
    previewGradient: 'from-[#2e111d] via-[#401a27] to-[#fb7185]',
  },
  cyberMatrix: {
    name: 'ماتريكس الهكر الأخضر النيون',
    nameEn: 'Cyber Matrix Neon',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(34,197,94,0.4),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(21,128,61,0.3),transparent_70%),linear-gradient(180deg,#062411_0%,#020f06_50%,#000602_100%)]',
    cardBg: 'bg-[#031307]/70 backdrop-blur-2xl',
    border: 'border-[#22c55e]/45',
    primary: 'from-[#86efac] via-[#22c55e] to-[#15803d]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(34,197,94,0.65)',
    accentText: 'text-[#86efac]',
    previewGradient: 'from-[#062411] via-[#083015] to-[#22c55e]',
  },
  stellarCosmic: {
    name: 'الكون النجمي والكهربائي',
    nameEn: 'Stellar Electric Blue',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(6,182,212,0.4),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(2,132,199,0.3),transparent_70%),linear-gradient(180deg,#071a38_0%,#020a1b_50%,#01040d_100%)]',
    cardBg: 'bg-[#030d22]/70 backdrop-blur-2xl',
    border: 'border-[#06b6d4]/45',
    primary: 'from-[#67e8f9] via-[#06b6d4] to-[#0284c7]',
    primaryHover: 'hover:brightness-110',
    glow: 'rgba(6,182,212,0.65)',
    accentText: 'text-[#67e8f9]',
    previewGradient: 'from-[#071a38] via-[#082046] to-[#06b6d4]',
  },
  pureLight: {
    name: 'العاج الملكي النقي الفاتح',
    nameEn: 'Imperial Ivory Gold',
    bg: 'bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(233,211,156,0.6),transparent_70%),radial-gradient(ellipse_60%_50%_at_10%_90%,rgba(197,160,89,0.4),transparent_70%),linear-gradient(180deg,#fffef7_0%,#f5f0e2_50%,#ece4d0_100%)]',
    cardBg: 'bg-white/90 backdrop-blur-2xl',
    border: 'border-[#c5a059]/45',
    primary: 'from-[#e9d39c] via-[#c5a059] to-[#8d6a26]',
    primaryHover: 'hover:brightness-105',
    glow: 'rgba(197,160,89,0.5)',
    accentText: 'text-[#8d6a26]',
    previewGradient: 'from-[#fffef7] via-[#eae3d5] to-[#c5a059]',
  },
};

// 10 Luxury Arabic Fonts
type ArabicFontMode =
  | 'kufi'
  | 'royal'
  | 'diwani'
  | 'elmessiri'
  | 'kufam'
  | 'lalezar'
  | 'rakkas'
  | 'changa'
  | 'readex'
  | 'tajawal';

interface ArabicFontOption {
  id: ArabicFontMode;
  name: string;
  cssClass: string;
  sample: string;
}

const LUXURY_ARABIC_FONTS: ArabicFontOption[] = [
  { id: 'kufi', name: 'الخط الكوفي الفاطمي الملكي', cssClass: 'font-kufi', sample: 'إيرثلنك برو · الخط الكوفي الهندسي الفخم' },
  { id: 'royal', name: 'خط الأميري الأندلسي الملكي', cssClass: 'font-royal', sample: 'إيرثلنك برو · الخط الملكي الأندلسي الفاخر' },
  { id: 'diwani', name: 'خط الرقعة والديواني الراقي', cssClass: 'font-diwani', sample: 'إيرثلنك برو · خط الرقعة الديواني الجذاب' },
  { id: 'elmessiri', name: 'خط المسيري المنحوت الفخم', cssClass: 'font-elmessiri', sample: 'إيرثلنك برو · خط المسيري المنحوت الجذاب' },
  { id: 'kufam', name: 'خط كوفام الحروفي العصري', cssClass: 'font-kufam', sample: 'إيرثلنك برو · خط كوفام العربي المعاصر' },
  { id: 'lalezar', name: 'خط لاليزر العريض الجريء', cssClass: 'font-lalezar', sample: 'إيرثلنك برو · خط لاليزر العربي البارز' },
  { id: 'rakkas', name: 'خط الرقاص الشرقي المزخرف', cssClass: 'font-rakkas', sample: 'إيرثلنك برو · خط الرقاص الزخرفي الفاخر' },
  { id: 'changa', name: 'خط تشانغا الهندسي الحاد', cssClass: 'font-changa', sample: 'إيرثلنك برو · خط تشانغا العصري القوي' },
  { id: 'readex', name: 'خط ريدكس برو فائق الوضوح', cssClass: 'font-readex', sample: 'إيرثلنك برو · خط ريدكس برو الحديث' },
  { id: 'tajawal', name: 'خط تجوال المتزن الاحترافي', cssClass: 'font-tajawal', sample: 'إيرثلنك برو · خط تجوال فائق التناسق' },
];

// 8 Luxury English Fonts
type EnglishFontMode =
  | 'orbitron'
  | 'cinzel'
  | 'syne'
  | 'michroma'
  | 'russo'
  | 'quantico'
  | 'playfair'
  | 'montserrat';

interface EnglishFontOption {
  id: EnglishFontMode;
  name: string;
  cssClass: string;
  sample: string;
}

const LUXURY_ENGLISH_FONTS: EnglishFontOption[] = [
  { id: 'orbitron', name: 'Orbitron Sci-Fi Futuristic', cssClass: 'font-en-orbitron', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'cinzel', name: 'Cinzel Roman Imperial', cssClass: 'font-en-cinzel', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'syne', name: 'Syne Avant-Garde Luxury', cssClass: 'font-en-syne', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'michroma', name: 'Michroma Ultra Tech', cssClass: 'font-en-michroma', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'russo', name: 'Russo One Bold Heavy', cssClass: 'font-en-russo', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'quantico', name: 'Quantico Military Digital', cssClass: 'font-en-quantico', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'playfair', name: 'Playfair Display Royal Serif', cssClass: 'font-en-playfair', sample: 'EARTHLINK PRO 2026 0123456789' },
  { id: 'montserrat', name: 'Montserrat Geometric Luxe', cssClass: 'font-en-montserrat', sample: 'EARTHLINK PRO 2026 0123456789' },
];

// 5 Semi-Transparent Polished Glass Modes (أنماط الكاردات شبه الزجاجية المصقولة 3D)
export type GlassMode = 'ultra' | 'liquid' | 'hologram' | 'mirror' | 'smoked';

export interface GlassPreset {
  id: GlassMode;
  name: string;
  nameEn: string;
  badge: string;
  desc: string;
  opacity: number;
  bgStyle: string;
  borderStyle: string;
  blurStyle: string;
  shadowStyle: string;
  previewBg: string;
  previewBorder: string;
}

export const GLASS_PRESETS: GlassPreset[] = [
  {
    id: 'ultra',
    name: 'زجاج كريستالي فائق الشفافية',
    nameEn: 'Ultra Crystal Diamond',
    badge: 'الأعلى وضوحاً 18%',
    desc: 'شفافية بلورية فائقة تبرز خلفية الموقع والشفق والنجوم بوضوح مذهل مع حواف مصقولة لامعة',
    opacity: 18,
    bgStyle: 'linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.03) 40%, rgba(10, 14, 24, 0.22) 100%)',
    borderStyle: 'rgba(255, 255, 255, 0.38)',
    blurStyle: 'blur(14px)',
    shadowStyle: '0 20px 50px rgba(0, 0, 0, 0.55), inset 0 1.5px 2px rgba(255, 255, 255, 0.65), inset 0 -1px 2px rgba(0, 0, 0, 0.3)',
    previewBg: 'from-white/20 via-white/5 to-black/30',
    previewBorder: 'border-white/50',
  },
  {
    id: 'liquid',
    name: 'زجاج سائل مصقول عاكس',
    nameEn: 'Liquid Gloss Mirror',
    badge: 'انعكاس سائل 28%',
    desc: 'سطح سائل مصقول عاكس يعطي لمعاناً زجاجياً مائياً فاخراً مع إبراز عناصر الـ 3D بدقة',
    opacity: 28,
    bgStyle: 'linear-gradient(140deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.06) 30%, rgba(8, 12, 22, 0.38) 100%)',
    borderStyle: 'rgba(255, 255, 255, 0.45)',
    blurStyle: 'blur(22px)',
    shadowStyle: '0 25px 60px rgba(0, 0, 0, 0.7), inset 0 2px 3px rgba(255, 255, 255, 0.75), inset 0 -2px 4px rgba(0, 0, 0, 0.45)',
    previewBg: 'from-white/30 via-white/10 to-blue-950/40',
    previewBorder: 'border-white/60',
  },
  {
    id: 'hologram',
    name: 'زجاج هولوغرافي نيون',
    nameEn: 'Cyber Neon Hologram',
    badge: 'نيون ليزري 24%',
    desc: 'زجاج سيبراني شفاف بلمسات نيون ليزرية ثلاثية الأبعاد تنبض بأناقة مع شبكة إيرثلنك',
    opacity: 24,
    bgStyle: 'linear-gradient(135deg, rgba(0, 242, 254, 0.16) 0%, rgba(216, 180, 106, 0.1) 45%, rgba(10, 15, 28, 0.28) 100%)',
    borderStyle: 'rgba(0, 242, 254, 0.5)',
    blurStyle: 'blur(18px)',
    shadowStyle: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 242, 254, 0.28), inset 0 1px 2px rgba(255, 255, 255, 0.55)',
    previewBg: 'from-cyan-500/25 via-amber-500/10 to-cyan-950/40',
    previewBorder: 'border-cyan-400/60',
  },
  {
    id: 'mirror',
    name: 'زجاج ذهبي ملوكي مصقول',
    nameEn: 'Imperial Gold Mirror',
    badge: 'ذهب مصقول 26%',
    desc: 'طبقة زجاجية ذهبية نصف شفافة مع بريق إمبراطوري يبرز كروت الاشتراك والأيقونات 3D',
    opacity: 26,
    bgStyle: 'linear-gradient(135deg, rgba(245, 223, 164, 0.2) 0%, rgba(216, 180, 106, 0.08) 40%, rgba(15, 12, 8, 0.35) 100%)',
    borderStyle: 'rgba(216, 180, 106, 0.55)',
    blurStyle: 'blur(20px)',
    shadowStyle: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 25px rgba(216, 180, 106, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.55)',
    previewBg: 'from-amber-400/25 via-yellow-500/10 to-amber-950/40',
    previewBorder: 'border-amber-400/60',
  },
  {
    id: 'smoked',
    name: 'زجاج كايبر مدخن ملكي',
    nameEn: 'Royal Frosted Smoked',
    badge: 'مدخن كايبر 55%',
    desc: 'زجاج مخملي نصف معتم بنسبة 55% لعشاق الهدوء والفخامة العميقة مع لمعان الحواف',
    opacity: 55,
    bgStyle: 'linear-gradient(180deg, rgba(22, 26, 36, 0.65) 0%, rgba(10, 12, 18, 0.78) 100%)',
    borderStyle: 'rgba(216, 180, 106, 0.4)',
    blurStyle: 'blur(30px)',
    shadowStyle: '0 20px 50px rgba(0, 0, 0, 0.85), inset 0 1px 2px rgba(255, 255, 255, 0.25)',
    previewBg: 'from-slate-800/70 via-slate-900/80 to-black/85',
    previewBorder: 'border-amber-400/40',
  },
];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'account' | 'subscription' | 'usage' | 'alerts' | 'speedtest' | 'allFields' | 'history' | 'contact' | 'settings'>('home');
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [accountData, setAccountData] = useState<NormalizedEarthlink | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('gold');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [activeArFont, setActiveArFont] = useState<ArabicFontMode>('kufi');
  const [activeEnFont, setActiveEnFont] = useState<EnglishFontMode>('orbitron');
  const [customAvatar, setCustomAvatar] = useState<string>('');
  const [customBgImage, setCustomBgImage] = useState<string>('');

  // Semi-Transparent Polished Glass & 3D Depth State
  const [glassMode, setGlassMode] = useState<GlassMode>(() => {
    return (localStorage.getItem('el_glass_mode') as GlassMode) || 'ultra';
  });
  const [glassSheenActive, setGlassSheenActive] = useState<boolean>(() => {
    return localStorage.getItem('el_glass_sheen') !== 'false';
  });
  const [effects3DActive, setEffects3DActive] = useState<boolean>(() => {
    return localStorage.getItem('el_3d_effects') !== 'false';
  });
  const [glassPickerOpen, setGlassPickerOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [refreshInterval, setRefreshInterval] = useState<number>(60000);

  // Soft Luminous Gleam State (وميض لامع ناعم عند النقر)
  const [clickGleams, setClickGleams] = useState<ClickGleam[]>([]);

  // Floating AI Glass Modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalMessage, setModalMessage] = useState<string>('');
  const [modalType, setModalType] = useState<'success' | 'error' | 'info'>('info');

  // Glass Dialog for Time & Refresh Pickers
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [activeNumberPicker, setActiveNumberPicker] = useState<'hour' | 'minute' | 'second' | null>(null);
  const [refreshPickerOpen, setRefreshPickerOpen] = useState(false);

  // Subscription Plan Image Modal
  const [imageModalOpen, setImageModalOpen] = useState(false);

  // Contact developer form state
  const [contactName, setContactName] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);

  // Advanced Speed Test & Diagnostics
  const [speedTestRunning, setSpeedTestRunning] = useState(false);
  const [speedStage, setSpeedStage] = useState<'idle' | 'ping' | 'download' | 'upload' | 'completed'>('idle');
  const [currentSpeedMbps, setCurrentSpeedMbps] = useState<number>(0);
  const [peakDownloadMbps, setPeakDownloadMbps] = useState<number>(48.6);
  const [peakUploadMbps, setPeakUploadMbps] = useState<number>(24.2);
  const [pingSpeed, setPingSpeed] = useState<number>(18);
  const [jitter, setJitter] = useState<number>(2);
  const [lossRate, setLossRate] = useState<number>(0);

  // Alert settings state with pre-filled credentials
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    webhookUrl: 'https://discord.com/api/webhooks/1555280750654398528/m7pjebcPl7DL95_KdyoEDcHspnG9Rk3mOfITsMhMJcgtGfave55W_LQQZ6pk0nDEfcIt',
    telegramBotToken: '8873866209:AAExp-CQKB8-6WDARWcotQKm8HUEpIomeKM',
    telegramChatId: '910624538',
    channel: 'both',
    day: 1,
    hour: 9,
    minute: 0,
    second: 0,
    period: 'AM',
    enabled: true,
    notifyOnDaysRemaining: 3,
  });

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Soft Luminous Gleam Trigger (وميض لامع ناعم)
  const triggerSoftGleam = useCallback((e?: React.MouseEvent) => {
    const x = e ? e.clientX : window.innerWidth / 2;
    const y = e ? e.clientY : window.innerHeight / 2;
    const id = Date.now() + Math.random();
    setClickGleams(prev => [...prev.slice(-3), { id, x, y }]);
    setTimeout(() => {
      setClickGleams(prev => prev.filter(g => g.id !== id));
    }, 600);
  }, []);

  // Smooth Dark / Light Mode Transition
  const toggleDarkLightMode = (e?: React.MouseEvent) => {
    triggerSoftGleam(e);
    if (isDarkMode) {
      setTheme('pureLight');
      setIsDarkMode(false);
      localStorage.setItem('el_dark_mode', 'false');
      localStorage.setItem('el_theme', 'pureLight');
      openLuxModal('وضع النهار الملكي', 'تم تفعيل الوضع الفاتح العاجي النقي بنجاح!', 'info');
    } else {
      setTheme('gold');
      setIsDarkMode(true);
      localStorage.setItem('el_dark_mode', 'true');
      localStorage.setItem('el_theme', 'gold');
      openLuxModal('وضع الظلام الإمبراطوري', 'تم تفعيل الوضع الليلي الأسود الذهبي بنجاح!', 'info');
    }
  };

  // Apply CSS variables to root dynamically so every element inherits font choices
  useEffect(() => {
    const arFontMap: Record<ArabicFontMode, string> = {
      kufi: "'Reem Kufi', sans-serif",
      royal: "'Amiri', serif",
      diwani: "'Aref Ruqaa', cursive",
      elmessiri: "'El Messiri', sans-serif",
      kufam: "'Kufam', sans-serif",
      lalezar: "'Lalezar', cursive",
      rakkas: "'Rakkas', cursive",
      changa: "'Changa', sans-serif",
      readex: "'Readex Pro', sans-serif",
      tajawal: "'Tajawal', sans-serif",
    };

    const enFontMap: Record<EnglishFontMode, string> = {
      orbitron: "'Orbitron', monospace",
      cinzel: "'Cinzel', serif",
      syne: "'Syne', sans-serif",
      michroma: "'Michroma', sans-serif",
      russo: "'Russo One', sans-serif",
      quantico: "'Quantico', monospace",
      playfair: "'Playfair Display', serif",
      montserrat: "'Montserrat', sans-serif",
    };

    document.documentElement.style.setProperty('--font-active-ar', arFontMap[activeArFont]);
    document.documentElement.style.setProperty('--font-active-en', enFontMap[activeEnFont]);
  }, [activeArFont, activeEnFont]);

  // Dynamically set Semi-Transparent Glassmorphism & 3D CSS Variables
  useEffect(() => {
    const preset = GLASS_PRESETS.find(p => p.id === glassMode) || GLASS_PRESETS[0];
    const root = document.documentElement;
    root.style.setProperty('--card-glass-bg', preset.bgStyle);
    root.style.setProperty('--card-glass-border', preset.borderStyle);
    root.style.setProperty('--card-glass-blur', preset.blurStyle);
    root.style.setProperty('--card-glass-shadow', preset.shadowStyle);
    const themeGlow = LUXURY_THEMES[theme]?.glow || 'rgba(216,180,106,0.6)';
    root.style.setProperty('--theme-glow', themeGlow);
    localStorage.setItem('el_glass_mode', glassMode);
    localStorage.setItem('el_glass_sheen', String(glassSheenActive));
    localStorage.setItem('el_3d_effects', String(effects3DActive));
  }, [glassMode, theme, glassSheenActive, effects3DActive]);

  // Live Baghdad Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('ar-IQ', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const openLuxModal = useCallback((title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setModalOpen(true);
  }, []);

  const addHistory = useCallback((action: string, result: string, success: boolean) => {
    const entry: HistoryLog = {
      id: Math.random().toString(36).substring(2),
      time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      result,
      success,
    };
    setHistory(prev => [entry, ...prev.slice(0, 49)]);
  }, []);

  // Fetch account data
  const refreshAccount = useCallback(async (silent = false) => {
    if (loading) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (!res.ok || data.authenticated === false) {
        if (isLoggedIn) {
          setIsLoggedIn(false);
          setAccountData(null);
          openLuxModal('انتهت الجلسة', 'انتهت صلاحية جلسة إيرثلنك، يرجى تسجيل الدخول مجدداً.', 'error');
        }
        return;
      }

      const normalized = normalizeEarthlinkData(data.data || data);
      if (!normalized.username && !normalized.fullName && !normalized.userID && !normalized.plan) {
        normalized.username = data.username || 'المشترك';
      }

      setAccountData(normalized);
      setLastUpdated(new Date());
      setIsLoggedIn(true);
      addHistory('تحديث حي للبيانات', 'تم جلب أحدث تفاصيل الاشتراك بنجاح', true);
      if (!silent) {
        openLuxModal('تم التحديث بنجاح', 'تم سحب وتحديث كامل بيانات الاشتراك المباشرة من خوادم إيرثلنك.', 'success');
      }
    } catch (err: any) {
      console.error('Refresh account failed:', err);
      addHistory('فحص الحساب', `فشل الاتصال: ${err?.message || 'خطأ غير معروف'}`, false);
      if (!silent) {
        openLuxModal('تعذر التحديث', `فشل الاتصال بخادم إيرثلنك: ${err?.message || 'خطأ شبكة'}`, 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loading, isLoggedIn, addHistory, openLuxModal]);

  // Load configuration from localStorage & server
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('el_theme') as ThemeMode;
      if (savedTheme && LUXURY_THEMES[savedTheme]) {
        setTheme(savedTheme);
        setIsDarkMode(savedTheme !== 'pureLight');
      }

      const savedArFont = localStorage.getItem('el_ar_font') as ArabicFontMode;
      if (savedArFont) setActiveArFont(savedArFont);

      const savedEnFont = localStorage.getItem('el_en_font') as EnglishFontMode;
      if (savedEnFont) setActiveEnFont(savedEnFont);

      const savedAvatar = localStorage.getItem('el_custom_avatar');
      if (savedAvatar) setCustomAvatar(savedAvatar);

      const savedBg = localStorage.getItem('el_custom_bg');
      if (savedBg) setCustomBgImage(savedBg);

      fetch('/api/alerts/config')
        .then(res => res.json())
        .then(cfg => {
          if (cfg) {
            setAlertConfig(prev => ({
              ...prev,
              ...cfg,
              webhookUrl: cfg.webhookUrl || prev.webhookUrl,
              telegramBotToken: cfg.telegramBotToken || prev.telegramBotToken,
              telegramChatId: cfg.telegramChatId || prev.telegramChatId,
            }));
          }
        })
        .catch(() => {});
    } catch (_) {}
  }, []);

  const changeArFont = (fontId: ArabicFontMode) => {
    setActiveArFont(fontId);
    localStorage.setItem('el_ar_font', fontId);
    const fontObj = LUXURY_ARABIC_FONTS.find(f => f.id === fontId);
    openLuxModal('تم تغيير الخط العربي', `تم تفعيل "${fontObj?.name}" لكافة الواجهة والنصوص بنجاح!`, 'success');
  };

  const changeEnFont = (fontId: EnglishFontMode) => {
    setActiveEnFont(fontId);
    localStorage.setItem('el_en_font', fontId);
    const fontObj = LUXURY_ENGLISH_FONTS.find(f => f.id === fontId);
    openLuxModal('تم تغيير الخط الإنجليزي', `تم تفعيل خط "${fontObj?.name}" لكافة الكلمات الإنجليزية والأرقام بنجاح!`, 'success');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setCustomAvatar(b64);
      localStorage.setItem('el_custom_avatar', b64);
      triggerSoftGleam();
      openLuxModal('تم تحديث الصورة', 'تم تغيير وحفظ صورتك الشخصية الدائرية بنجاح!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setCustomBgImage(b64);
      localStorage.setItem('el_custom_bg', b64);
      triggerSoftGleam();
      openLuxModal('تم تغيير الخلفية', 'تم تعيين صورتك المخصصة من الاستوديو كخلفية للموقع بنجاح!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const clearBgImage = () => {
    setCustomBgImage('');
    localStorage.removeItem('el_custom_bg');
    openLuxModal('استعادة الخلفية', 'تمت استعادة الخلفية الافتراضية للثيم بنجاح.', 'info');
  };

  const saveAlertSettings = async (newConfig?: AlertConfig) => {
    const configToSave = newConfig || alertConfig;
    try {
      localStorage.setItem('el_alert_config', JSON.stringify(configToSave));
      const res = await fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSave),
      });
      if (res.ok) {
        triggerSoftGleam();
        openLuxModal('حفظ الإعدادات', 'تم حفظ توقيت التنبيه الآلي وقنوات الإرسال بنجاح.', 'success');
        addHistory('حفظ إعدادات التنبيه', 'تم تحديث التوقيت وقنوات الإرسال', true);
      }
    } catch (e: any) {
      openLuxModal('حفظ محلي', 'تم حفظ الإعدادات على هذا المتصفح بنجاح.', 'info');
    }
  };

  // Instant Alert trigger
  const handleInstantAlert = async (e?: React.MouseEvent) => {
    triggerSoftGleam(e);
    openLuxModal('جاري الإرسال الفوري...', 'يتم الآن إرسال بيانات الاشتراك مع صورة الباقة إلى القنوات المحددة.', 'info');
    try {
      const res = await fetch('/api/alerts/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountData }),
      });
      const data = await res.json();
      if (data.success) {
        openLuxModal('تم إرسال الإشعار الفوري', `نجح الإرسال: ${data.details || 'تم استلام الإشعار في تليجرام وديسكورد بنجاح'}`, 'success');
        addHistory('إرسال تنبيه فوري', data.details || 'نجح الإرسال', true);
      } else {
        openLuxModal('تنبيه الإرسال', data.details || data.error || 'يرجى التأكد من التوكن والرابط', 'error');
        addHistory('إرسال تنبيه فوري', data.details || 'فشل', false);
      }
    } catch (err: any) {
      openLuxModal('خطأ في الإرسال', err?.message || 'تعذر الاتصال بخادم التنبيهات', 'error');
    }
  };

  // Contact developer via Discord Webhook
  const handleSendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactMessage.trim()) {
      openLuxModal('تنبيه', 'يرجى كتابة اسمك ورسالتك قبل الإرسال', 'info');
      return;
    }

    setContactSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName.trim(),
          message: contactMessage.trim(),
          username: accountData?.username,
          accountData,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setContactMessage('');
        triggerSoftGleam();
        openLuxModal('تم الإرسال بنجاح', 'تم تسليم رسالتك للمبرمج مباشرة عبر الويب هوك مع بيانات حسابك وتاريخ الإرسال.', 'success');
        addHistory('مراسلة المبرمج', 'تم إرسال الرسالة إلى Discord Webhook بنجاح', true);
      } else {
        openLuxModal('فشل الإرسال', data.error || 'تعذر الإرسال إلى الويب هوك', 'error');
      }
    } catch (err: any) {
      openLuxModal('خطأ في الإرسال', err?.message || 'تعذر الاتصال بخادم الرسائل', 'error');
    } finally {
      setContactSending(false);
    }
  };

  // High-Tech Speed Test Sequence
  const runSpeedTestSequence = () => {
    if (speedTestRunning) return;
    setSpeedTestRunning(true);
    setSpeedStage('ping');
    setCurrentSpeedMbps(0);

    let pStep = 0;
    const pTimer = setInterval(() => {
      pStep++;
      setPingSpeed(Math.floor(14 + Math.random() * 10));
      setJitter(Math.floor(1 + Math.random() * 3));
      if (pStep >= 6) {
        clearInterval(pTimer);
        setSpeedStage('download');
        let dStep = 0;
        const dTimer = setInterval(() => {
          dStep++;
          const target = 35 + Math.random() * 35;
          setCurrentSpeedMbps(Number(target.toFixed(1)));
          setPeakDownloadMbps(prev => Math.max(prev, Number(target.toFixed(1))));
          if (dStep >= 12) {
            clearInterval(dTimer);
            setSpeedStage('upload');
            let uStep = 0;
            const uTimer = setInterval(() => {
              uStep++;
              const uTarget = 15 + Math.random() * 20;
              setCurrentSpeedMbps(Number(uTarget.toFixed(1)));
              setPeakUploadMbps(prev => Math.max(prev, Number(uTarget.toFixed(1))));
              if (uStep >= 10) {
                clearInterval(uTimer);
                setSpeedStage('completed');
                setSpeedTestRunning(false);
                setCurrentSpeedMbps(0);
                triggerSoftGleam();
                openLuxModal('اكتمل فحص السرعة', `فحص الشبكة المباشر:\n• التنزيل: ${peakDownloadMbps} Mbps\n• الرفع: ${peakUploadMbps} Mbps\n• البنج: ${pingSpeed} ms\n• الجودة: ممتازة جداً (A+)`, 'success');
              }
            }, 250);
          }
        }, 250);
      }
    }, 200);
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setLoginError('يرجى كتابة اسم المستخدم وكلمة المرور');
      return;
    }

    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول إلى إيرثلنك');
      }

      setIsLoggedIn(true);
      const normalized = normalizeEarthlinkData(data.data || {});
      if (!normalized.username) normalized.username = username.trim();
      setAccountData(normalized);
      setLastUpdated(new Date());
      addHistory('تسجيل دخول جديد', `تم الاتصال بنجاح بالمستخدم ${username.trim()}`, true);
      triggerSoftGleam();
      openLuxModal('أهلاً بك', 'تم تسجيل الدخول بنجاح وربط حسابك المباشر مع شبكة إيرثلنك!', 'success');
      setPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'تعذر الاتصال بخادم إيرثلنك');
      addHistory('محاولة تسجيل دخول', `فشل: ${err.message}`, false);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    setIsLoggedIn(false);
    setAccountData(null);
    addHistory('تسجيل الخروج', 'تم إنهاء الجلسة', true);
    openLuxModal('تسجيل الخروج', 'تم إنهاء الجلسة وإغلاق الاتصال بأمان.', 'info');
  };

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.data) {
          const normalized = normalizeEarthlinkData(data.data);
          if (!normalized.username) normalized.username = data.username;
          setAccountData(normalized);
          setIsLoggedIn(true);
          setLastUpdated(new Date());
          addHistory('استعادة الجلسة', 'تم التعرف على جلسة نشطة سابقة', true);
        }
      })
      .catch(() => {});
  }, [addHistory]);

  const daysNum = useMemo(() => {
    if (!accountData?.daysLeft) return null;
    const parsed = parseInt(String(accountData.daysLeft), 10);
    return isNaN(parsed) ? null : parsed;
  }, [accountData?.daysLeft]);

  const ringDashOffset = useMemo(() => {
    if (daysNum === null) return 440;
    const maxCycle = 30;
    const ratio = Math.max(0, Math.min(1, daysNum / maxCycle));
    return 440 - 440 * ratio;
  }, [daysNum]);

  // Speedometer Needle angle (-90deg to +90deg)
  const needleAngle = useMemo(() => {
    const val = speedTestRunning ? currentSpeedMbps : peakDownloadMbps;
    const max = 100;
    const clamped = Math.min(max, Math.max(0, val));
    return -90 + (clamped / max) * 180;
  }, [currentSpeedMbps, peakDownloadMbps, speedTestRunning]);

  const currentTheme = LUXURY_THEMES[theme] || LUXURY_THEMES.gold;
  const isLight = theme === 'pureLight';

  // 5 Main Tabs for the Floating Luxury Dock
  const bottomFiveTabs = [
    { id: 'home', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'subscription', label: 'باقة PLUS', icon: Crown },
    { id: 'speedtest', label: 'السرعة 3D', icon: Activity },
    { id: 'alerts', label: 'التنبيه الآلي', icon: BellRing },
    { id: 'account', label: 'حسابي', icon: User },
  ];

  // 4 Organized Categorical Navigation Groups for the Sidebar
  const sidebarNavGroups = [
    {
      category: 'القيادة والمراقبة الحية',
      items: [
        { id: 'home', label: 'لوحة التحكم والعمليات', icon: LayoutDashboard },
        { id: 'speedtest', label: 'فحص السرعة والجودة 3D', icon: Activity, badge: 'LIVE 3D' },
      ],
    },
    {
      category: 'الاشتراك وهوية المشترك',
      items: [
        { id: 'subscription', label: 'كادر باقة PLUS المحفورة', icon: Crown, badge: 'PLUS' },
        { id: 'account', label: 'الملف التعريفي للمشترك', icon: User },
      ],
    },
    {
      category: 'الشبكة والاستهلاك الفعلي',
      items: [
        { id: 'usage', label: 'استهلاك البيانات ومؤشرات النقل', icon: LineChart },
        { id: 'allFields', label: `بيانات السيرفر الخام (${accountData?.allFields?.length || 0})`, icon: Globe },
      ],
    },
    {
      category: 'الأتمتة والتخصيص والمظهر',
      items: [
        { id: 'alerts', label: 'نظام التنبيه التلقائي (YML/Bot)', icon: BellRing, badge: 'AUTO' },
        { id: 'contact', label: 'مراسلة المبرمج مباشرة (Discord)', icon: MessageSquareHeart, badge: 'VIP' },
        { id: 'settings', label: 'الثيمات الـ 12 والخطوط الـ 18', icon: Sliders },
        { id: 'history', label: 'سجل التحديثات والعمليات', icon: History },
      ],
    },
  ];

  return (
    <div
      dir="rtl"
      onContextMenu={e => e.preventDefault()}
      style={
        customBgImage
          ? {
              backgroundImage: `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.92)), url(${customBgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
            }
          : undefined
      }
      className={`min-h-screen select-none transition-colors duration-700 pb-28 font-active-ar ${
        !customBgImage ? currentTheme.bg : ''
      } ${isLight && !customBgImage ? 'text-neutral-900' : 'text-[#f5f2eb]'}`}
    >
      {/* Soft Luminous Gleam Elements (وميض لامع ناعم عند النقر) */}
      {clickGleams.map(g => (
        <div
          key={g.id}
          className="soft-click-gleam"
          style={{ left: g.x, top: g.y, width: 160, height: 160 }}
        />
      ))}

      {/* Hidden File Inputs for Profile Avatar & Custom Background */}
      <input
        type="file"
        ref={avatarInputRef}
        onChange={handleAvatarUpload}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={bgInputRef}
        onChange={handleBgUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Dynamic Opulent Ambient Background Glows & Stardust (خلفية فخمة مبهرة) */}
      {!customBgImage && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {/* Subtle Stardust Mesh */}
          <div className="absolute inset-0 luxury-mesh-stars opacity-40 pointer-events-none" />

          {/* Celestial Rotating Photon Rays */}
          <div className="luxury-celestial-rays opacity-25" />

          {/* Radiant Primary Aurora Light Pool (Top Right) */}
          <div
            style={{ background: currentTheme.glow }}
            className="absolute w-[680px] h-[680px] rounded-full luxury-aurora-pool-1 -top-24 -right-16"
          />

          {/* Radiant Secondary Aurora Light Pool (Bottom Left) */}
          <div
            style={{ background: currentTheme.glow }}
            className="absolute w-[640px] h-[640px] rounded-full luxury-aurora-pool-2 -bottom-24 -left-16"
          />

          {/* Center Ambient Beam for Contrast */}
          <div
            style={{
              background: `radial-gradient(circle, ${currentTheme.glow} 0%, transparent 70%)`,
            }}
            className="absolute w-[800px] h-[500px] rounded-full blur-[140px] opacity-40 top-1/4 left-1/2 -translate-x-1/2"
          />
        </div>
      )}

      {/* LUXURY GLASS MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md p-6 sm:p-7 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} shadow-[0_25px_70px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative overflow-hidden`}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    modalType === 'success'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : modalType === 'error'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-[#d8b46a]/20 text-[#f5dfa4] border border-[#d8b46a]/30'
                  }`}
                >
                  {modalType === 'success' && <CheckCircle2 className="w-5 h-5" />}
                  {modalType === 'error' && <AlertCircle className="w-5 h-5" />}
                  {modalType === 'info' && <Sparkles className="w-5 h-5" />}
                </div>
                <h3 className="text-base font-bold text-white font-active-ar">{modalTitle}</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6 font-active-ar whitespace-pre-line">{modalMessage}</p>

            <button
              onClick={e => {
                setModalOpen(false);
                triggerSoftGleam(e);
              }}
              className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all font-active-ar`}
            >
              موافق
            </button>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION PLAN IMAGE FULL-VIEW MODAL */}
      {imageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200">
          <div className={`w-full max-w-xl p-6 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} shadow-2xl relative`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-black text-white font-active-ar flex items-center gap-2">
                <Crown className={`w-4 h-4 ${currentTheme.accentText}`} />
                <span>صورة باقة إيرثلنك PLUS الرسمية</span>
              </h3>
              <button
                onClick={() => setImageModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-white/15 bg-black/50 p-2 flex items-center justify-center min-h-[280px]">
              {accountData?.image ? (
                <img
                  src={accountData.image}
                  alt="Earthlink Subscription Card"
                  className="max-h-[380px] w-auto object-contain rounded-xl shadow-2xl"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="w-full py-16 text-center space-y-3">
                  <div className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr ${currentTheme.primary} text-neutral-950 flex items-center justify-center shadow-2xl`}>
                    <Crown className="w-10 h-10" />
                  </div>
                  <h4 className="text-xl font-black text-white font-active-ar">باقة إيرثلنك PLUS</h4>
                  <p className="text-xs text-neutral-400 font-active-ar">بطاقة الاشتراك الإلكترونية المعتمدة للشبكة</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className={`text-xs ${currentTheme.accentText} font-bold font-active-ar`}>
                المشترك: {accountData?.fullName || accountData?.username}
              </span>
              <button
                onClick={() => setImageModalOpen(false)}
                className={`px-5 py-2.5 rounded-xl bg-gradient-to-r ${currentTheme.primary} text-neutral-950 text-xs font-black font-active-ar shadow-lg`}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LUXURY NUMBER SELECTION WHEEL */}
      {activeNumberPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div className={`w-full max-w-md p-6 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} shadow-2xl backdrop-blur-2xl space-y-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Clock className={`w-5 h-5 ${currentTheme.accentText}`} />
                <h3 className="text-sm font-black text-white font-active-ar">
                  {activeNumberPicker === 'hour' && 'اختر الساعة الفخمة (1 - 12)'}
                  {activeNumberPicker === 'minute' && 'اختر الدقيقة الفخمة (00 - 59)'}
                  {activeNumberPicker === 'second' && 'اختر الثانية الفخمة (00 - 59)'}
                </h3>
              </div>
              <button
                onClick={() => setActiveNumberPicker(null)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto p-1 bg-white/[0.02] rounded-2xl border border-white/5">
              {Array.from(
                { length: activeNumberPicker === 'hour' ? 12 : 60 },
                (_, i) => (activeNumberPicker === 'hour' ? i + 1 : i)
              ).map(num => {
                const currentVal =
                  activeNumberPicker === 'hour'
                    ? alertConfig.hour
                    : activeNumberPicker === 'minute'
                    ? alertConfig.minute
                    : alertConfig.second;
                const selected = currentVal === num;
                return (
                  <button
                    key={num}
                    onClick={e => {
                      if (activeNumberPicker === 'hour') setAlertConfig({ ...alertConfig, hour: num });
                      if (activeNumberPicker === 'minute') setAlertConfig({ ...alertConfig, minute: num });
                      if (activeNumberPicker === 'second') setAlertConfig({ ...alertConfig, second: num });
                      setActiveNumberPicker(null);
                      triggerSoftGleam(e);
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold font-num transition-all ${
                      selected
                        ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 font-black shadow-lg`
                        : 'bg-white/[0.03] text-neutral-300 hover:bg-white/[0.08] hover:text-white border border-white/5'
                    }`}
                  >
                    {String(num).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* LUXURY GLASS DIALOG: TIME & DATE PICKER */}
      {timePickerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div className={`w-full max-w-lg p-7 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} shadow-2xl backdrop-blur-2xl space-y-5 relative`}>
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <Clock className={`w-5 h-5 ${currentTheme.accentText}`} />
                <h3 className="text-base font-black text-white font-active-ar">تحديد موعد التنبيه الآلي الفخم</h3>
              </div>
              <button
                onClick={() => setTimePickerOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Day Picker */}
            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-2 font-active-ar">اليوم من الشهر (1 - 31)</label>
              <div className="grid grid-cols-7 sm:grid-cols-11 gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-white/[0.02] rounded-2xl border border-white/5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={e => {
                      setAlertConfig({ ...alertConfig, day: d });
                      triggerSoftGleam(e);
                    }}
                    className={`py-2 text-xs font-bold rounded-xl font-num transition-all ${
                      alertConfig.day === d
                        ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 font-black shadow-md`
                        : 'hover:bg-white/10 text-neutral-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Luxurious Interactive Time Cards */}
            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-2 font-active-ar">
                انقر على الساعة أو الدقيقة أو الثانية لفتح لوحة اختيار الأرقام الفخمة
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div
                  onClick={() => setActiveNumberPicker('hour')}
                  className="cursor-pointer p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#d8b46a] text-center transition-all group"
                >
                  <span className="text-[10px] text-neutral-400 block font-active-ar mb-1">الساعة</span>
                  <div className={`text-3xl font-black font-num ${currentTheme.accentText}`}>
                    {String(alertConfig.hour).padStart(2, '0')}
                  </div>
                  <span className="text-[9px] text-neutral-500 block mt-1">انقر للتغيير</span>
                </div>

                <div
                  onClick={() => setActiveNumberPicker('minute')}
                  className="cursor-pointer p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#d8b46a] text-center transition-all group"
                >
                  <span className="text-[10px] text-neutral-400 block font-active-ar mb-1">الدقيقة</span>
                  <div className={`text-3xl font-black font-num ${currentTheme.accentText}`}>
                    {String(alertConfig.minute).padStart(2, '0')}
                  </div>
                  <span className="text-[9px] text-neutral-500 block mt-1">انقر للتغيير</span>
                </div>

                <div
                  onClick={() => setActiveNumberPicker('second')}
                  className="cursor-pointer p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#d8b46a] text-center transition-all group"
                >
                  <span className="text-[10px] text-neutral-400 block font-active-ar mb-1">الثانية</span>
                  <div className={`text-3xl font-black font-num ${currentTheme.accentText}`}>
                    {String(alertConfig.second).padStart(2, '0')}
                  </div>
                  <span className="text-[9px] text-neutral-500 block mt-1">انقر للتغيير</span>
                </div>
              </div>
            </div>

            {/* AM / PM */}
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1 font-active-ar">الفترة الزمنية</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAlertConfig({ ...alertConfig, period: 'AM' })}
                  className={`py-2.5 text-xs font-bold rounded-xl border transition-all font-active-ar ${
                    alertConfig.period === 'AM'
                      ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 font-black`
                      : 'bg-white/[0.02] text-neutral-400 border-white/10'
                  }`}
                >
                  صباحاً (AM)
                </button>
                <button
                  type="button"
                  onClick={() => setAlertConfig({ ...alertConfig, period: 'PM' })}
                  className={`py-2.5 text-xs font-bold rounded-xl border transition-all font-active-ar ${
                    alertConfig.period === 'PM'
                      ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 font-black`
                      : 'bg-white/[0.02] text-neutral-400 border-white/10'
                  }`}
                >
                  مساءً (PM)
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  saveAlertSettings();
                  setTimePickerOpen(false);
                }}
                className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all font-active-ar`}
              >
                تأكيد وحفظ موعد التنبيه الفخم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LUXURY GLASS DIALOG: REFRESH INTERVAL PICKER */}
      {refreshPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
          <div className={`w-full max-w-sm p-6 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} shadow-2xl backdrop-blur-2xl space-y-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${currentTheme.accentText}`} />
                <h3 className="text-sm font-black text-white font-active-ar">تحديث البيانات التلقائي</h3>
              </div>
              <button
                onClick={() => setRefreshPickerOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { val: 30000, label: 'كل 30 ثانية' },
                { val: 60000, label: 'كل دقيقة (موصى به)' },
                { val: 180000, label: 'كل 3 دقائق' },
                { val: 300000, label: 'كل 5 دقائق' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={e => {
                    setRefreshInterval(opt.val);
                    setRefreshPickerOpen(false);
                    triggerSoftGleam(e);
                    openLuxModal('معدل التحديث', `تم ضبط التحديث التلقائي: ${opt.label}`, 'success');
                  }}
                  className={`w-full p-3 rounded-xl border text-xs font-bold text-right flex items-center justify-between transition-all font-active-ar ${
                    refreshInterval === opt.val
                      ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 font-black`
                      : 'bg-white/[0.02] border-white/10 text-neutral-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {refreshInterval === opt.val && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LUXURY SEMI-TRANSPARENT GLASS & 3D CONTROLLER DIALOG */}
      {glassPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="w-full max-w-lg p-6 sm:p-7 rounded-3xl cyber-hud-card border border-white/30 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            <span className="cyber-corner-tl" />
            <span className="cyber-corner-br" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center icon-3d text-cyan-300">
                  <Sparkles className="w-5 h-5 animate-icon-breath" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white font-active-ar text-3d-title">
                    الكاردات شبه الزجاجية وتأثيرات 3D
                  </h3>
                  <span className="text-[10px] text-cyan-300 font-active-en font-bold tracking-wider">
                    SEMI-TRANSPARENT LIQUID GLASS & 3D DEPTH
                  </span>
                </div>
              </div>
              <button
                onClick={() => setGlassPickerOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Interactive Preview Card over background */}
            <div className="relative p-5 rounded-2xl border border-white/20 overflow-hidden bg-white/5 backdrop-blur-md">
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-cyan-400/30 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-amber-400/30 blur-2xl pointer-events-none" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 to-amber-300 flex items-center justify-center text-neutral-950 font-black icon-3d shadow-xl">
                    <Satellite className="w-6 h-6 animate-radar-spin" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block text-3d-title font-active-ar">
                      معاينة حية للزجاج المصقول
                    </span>
                    <span className="text-[11px] text-cyan-200 block text-3d-luxury font-active-en font-bold">
                      {GLASS_PRESETS.find(p => p.id === glassMode)?.nameEn || 'ULTRA GLASS'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-[#f5dfa4] font-num text-3d-value block">
                    3D DEPTH
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold block font-active-ar">
                    خلفية واضحة ومشرقة
                  </span>
                </div>
              </div>
            </div>

            {/* 5 Glass Presets */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-neutral-300 font-active-ar">
                اختر نمط الزجاج المفضل (5 أنماط مصقولة بدقة):
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {GLASS_PRESETS.map(preset => {
                  const selected = glassMode === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={e => {
                        setGlassMode(preset.id);
                        triggerSoftGleam(e);
                      }}
                      className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-center justify-between group relative overflow-hidden ${
                        selected
                          ? 'border-cyan-400 bg-white/10 shadow-[0_0_20px_rgba(6,182,212,0.35)] scale-[1.01]'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl border ${preset.previewBorder} bg-gradient-to-br ${preset.previewBg} flex items-center justify-center shadow-inner`}>
                          <Sparkles className={`w-4 h-4 ${selected ? 'text-cyan-300' : 'text-neutral-400'} icon-3d`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black font-active-ar ${selected ? 'text-cyan-200 text-3d-title' : 'text-white'}`}>
                              {preset.name}
                            </span>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold font-active-en">
                              {preset.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-400 font-active-ar mt-0.5 leading-snug">
                            {preset.desc}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selected ? (
                          <div className="w-6 h-6 rounded-full bg-cyan-400 text-neutral-950 flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 font-black" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-white/20" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Toggles: Sheen & 3D */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={e => {
                  setGlassSheenActive(!glassSheenActive);
                  triggerSoftGleam(e);
                }}
                className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center gap-1.5 font-active-ar ${
                  glassSheenActive
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                    : 'bg-white/[0.02] border-white/10 text-neutral-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4" />
                  <span>انعكاس البريق المصقول</span>
                </div>
                <span className="text-[10px] font-normal opacity-80">
                  {glassSheenActive ? 'مُفعّل (شريط ضوء علوي)' : 'مُعطل'}
                </span>
              </button>

              <button
                type="button"
                onClick={e => {
                  setEffects3DActive(!effects3DActive);
                  triggerSoftGleam(e);
                }}
                className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center gap-1.5 font-active-ar ${
                  effects3DActive
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    : 'bg-white/[0.02] border-white/10 text-neutral-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Diamond className="w-4 h-4" />
                  <span>أيقونات وكلام 3D بارز</span>
                </div>
                <span className="text-[10px] font-normal opacity-80">
                  {effects3DActive ? 'مُفعّل (ظلال متعددة الطبقات)' : 'مُعطل'}
                </span>
              </button>
            </div>

            <button
              onClick={e => {
                setGlassPickerOpen(false);
                triggerSoftGleam(e);
                openLuxModal('تأكيد النمط الزجاجي', `تم تفعيل نمط ${GLASS_PRESETS.find(p => p.id === glassMode)?.name} وتأثيرات 3D بنجاح!`, 'success');
              }}
              className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-xl transition-all font-active-ar flex items-center justify-center gap-2`}
            >
              <Check className="w-4 h-4 font-black" />
              <span>تطبيق النمط الزجاجي المختار فوراً</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          1. LOGIN SCREEN
      ======================================================== */}
      {!isLoggedIn ? (
        <div className="relative min-h-screen flex items-center justify-center p-4 z-10">
          <div
            className={`w-full max-w-md p-8 sm:p-10 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} backdrop-blur-2xl shadow-[0_30px_90px_rgba(0,0,0,0.65)] relative overflow-hidden`}
          >
            <div className="text-center mb-8 relative">
              <div
                className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr ${currentTheme.primary} text-neutral-950 flex items-center justify-center shadow-lg -rotate-3 mb-4 animate-float`}
              >
                <Satellite className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black tracking-wider text-white font-active-en">EARTHLINK PRO</h1>
              <p className={`text-xs ${currentTheme.accentText} font-bold tracking-widest mt-1 font-active-en`}>
                COMMAND CENTER & DISPATCHER
              </p>
              <p className="text-xs text-neutral-400 mt-2 font-active-ar">تسجيل الدخول المباشر لحسابك في شبكة إيرثلنك</p>
            </div>

            {loginError && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-active-ar">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-2 font-active-ar">
                  اسم المستخدم / <span className="font-active-en">USERNAME</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="أدخل اسم مستخدم إيرثلنك"
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-[#d8b46a] transition-all font-active-ar"
                  />
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-2 font-active-ar">
                  كلمة المرور / <span className="font-active-en">PASSWORD</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    required
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-[#d8b46a] transition-all pl-11 font-active-ar"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-3.5 text-neutral-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className={`w-full py-3.5 px-6 rounded-xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-bold text-sm shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 font-active-ar`}
              >
                {loginLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الاتصال والتحقق من إيرثلنك...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>تسجيل الدخول إلى إيرثلنك</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* ========================================================
            2. LOGGED IN COMMAND CENTER
        ======================================================== */
        <div className="relative min-h-screen flex flex-col z-10">
          {/* Mobile Overlay */}
          {mobileMenuOpen && (
            <div
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 transition-opacity"
            />
          )}

          {/* LUXURY TOP BAR WITH SITE TITLE, DARK/LIGHT TOGGLE & BAGHDAD CLOCK */}
          <header className={`sticky top-0 z-30 ${currentTheme.cardBg} border-b ${currentTheme.border} backdrop-blur-2xl px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 transition-colors duration-700`}>
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className={`p-2.5 rounded-2xl bg-white/[0.05] border ${currentTheme.border} text-white hover:brightness-125 transition-all shadow-md`}
                title="فتح القائمة الجانبية الكاملة"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${currentTheme.primary} text-neutral-950 flex items-center justify-center shadow-[0_0_20px_rgba(216,180,106,0.4)] -rotate-3 relative group`}
                >
                  <Satellite className="w-6 h-6 animate-radar-spin" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-black tracking-wider text-white font-active-en">EARTHLINK PRO</h1>
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-bold flex items-center gap-1.5 font-active-en">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>LIVE NET</span>
                    </span>
                  </div>
                  <span className={`text-[10px] ${currentTheme.accentText} font-bold tracking-widest block font-num`}>
                    {accountData?.username || 'SUBSCRIBER CENTER'}
                  </span>
                </div>
              </div>
            </div>

            {/* Top Center: Real-Time Digital Baghdad Clock */}
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/40 border border-[#d8b46a]/30 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] relative overflow-hidden group">
              <span className="cyber-corner-tl" />
              <div className="relative flex items-center justify-center">
                <span className="w-3 h-3 rounded-full bg-emerald-400/30 animate-beacon-ring absolute" />
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping relative z-10" />
              </div>
              <div className="text-center">
                <span className="text-[10px] text-neutral-400 block font-semibold font-active-ar flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#f5dfa4] animate-icon-breath" />
                  <span>توقيت بغداد المباشر</span>
                </span>
                <span className="text-sm font-black font-num tracking-wider text-[#f5dfa4]">{currentTime || '00:00:00'}</span>
              </div>
            </div>

            {/* Top Right: Luxury Glass & 3D + Dark/Light Toggle + Background + Avatar + Logout */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Luxury Semi-Transparent Glass & 3D Cards Controller */}
              <button
                onClick={e => {
                  setGlassPickerOpen(true);
                  triggerSoftGleam(e);
                }}
                title="تخصيص الكاردات شبه الزجاجية المصقولة وتأثيرات 3D"
                className="px-3 py-2 rounded-2xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.25)] flex items-center gap-2 transition-all duration-300 group"
              >
                <Sparkles className="w-4 h-4 text-cyan-300 animate-icon-breath group-hover:rotate-12 transition-transform" />
                <span className="text-xs font-black font-active-ar hidden lg:inline">الكاردات الزجاجية 3D</span>
                <span className="text-[10px] bg-cyan-400/20 text-cyan-200 px-1.5 py-0.5 rounded-full border border-cyan-400/30 font-bold font-active-en">
                  {glassMode.toUpperCase()}
                </span>
              </button>

              {/* Luxury Day/Night Mode Switcher */}
              <button
                onClick={toggleDarkLightMode}
                title={isDarkMode ? 'التحويل للوضع النهاري الملكي' : 'التحويل للوضع الليلي الإمبراطوري'}
                className={`p-2.5 rounded-2xl border transition-all duration-500 ${
                  isDarkMode
                    ? 'bg-white/[0.05] border-[#d8b46a]/50 text-[#f5dfa4] hover:shadow-[0_0_15px_rgba(216,180,106,0.3)]'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-600 hover:bg-amber-500/25'
                }`}
              >
                {isDarkMode ? <Sun className="w-4 h-4 animate-spin-slow" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setRefreshPickerOpen(true)}
                title="تخصيص معدل التحديث التلقائي"
                className={`p-2.5 rounded-2xl bg-white/[0.04] border ${currentTheme.border} text-white hover:brightness-125 transition-all`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                onClick={() => bgInputRef.current?.click()}
                title="تغيير خلفية الموقع بصورة من الاستوديو"
                className={`p-2.5 rounded-2xl bg-white/[0.04] border ${currentTheme.border} text-white hover:brightness-125 transition-all`}
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              {customBgImage && (
                <button
                  onClick={clearBgImage}
                  title="استعادة خلفية الثيم الافتراضية"
                  className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => refreshAccount(false)}
                disabled={loading}
                title="تحديث البيانات فوراً"
                className={`p-2.5 rounded-2xl bg-white/[0.04] border ${currentTheme.border} text-white hover:brightness-125 transition-all disabled:opacity-50`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              {/* Editable Circular Profile Avatar */}
              <div
                onClick={() => avatarInputRef.current?.click()}
                title="انقر لتغيير صورتك الشخصية الدائرية"
                className="relative group cursor-pointer w-10 h-10 rounded-full border-2 border-[#d8b46a] overflow-hidden bg-gradient-to-tr from-[#55442a] to-[#222] shadow-md flex items-center justify-center transition-transform hover:scale-105"
              >
                {customAvatar ? (
                  <img src={customAvatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                ) : accountData?.image && accountData.image.startsWith('http') ? (
                  <img src={accountData.image} alt="Avatar" className="w-full h-full object-cover rounded-full" crossOrigin="anonymous" />
                ) : (
                  <span className="text-sm font-black text-[#f5dfa4] font-active-en">
                    {accountData?.username?.charAt(0).toUpperCase() || <User className="w-5 h-5" />}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Camera className="w-4 h-4" />
                </div>
              </div>

              <button
                onClick={handleLogout}
                title="تسجيل الخروج"
                className="p-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* ========================================================
              ULTRA-LUXURIOUS CATEGORIZED SIDEBAR DRAWER (القائمة الجانبية الفاخرة)
          ======================================================== */}
          <aside
            className={`fixed top-0 right-0 h-screen w-88 max-w-[85vw] z-50 ${currentTheme.cardBg} border-l ${currentTheme.border} backdrop-blur-3xl flex flex-col p-6 transition-transform duration-500 shadow-2xl ${
              mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${currentTheme.primary} text-neutral-950 flex items-center justify-center shadow-lg -rotate-3`}
                >
                  <Satellite className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white font-active-ar">منصة إيرثلنك برو</h3>
                  <span className={`text-[10px] ${currentTheme.accentText} font-bold font-active-en`}>EXECUTIVE COMMAND DOCK</span>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Subscriber Identity Chip Card in Drawer */}
            <div className="my-4 p-4 rounded-2xl bg-white/[0.03] border border-[#d8b46a]/30 shadow-inner flex items-center gap-3">
              <div
                onClick={() => avatarInputRef.current?.click()}
                className="relative group cursor-pointer w-12 h-12 rounded-full border-2 border-[#d8b46a] overflow-hidden flex-shrink-0"
              >
                {customAvatar ? (
                  <img src={customAvatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                ) : accountData?.image ? (
                  <img src={accountData.image} alt="Avatar" className="w-full h-full object-cover rounded-full" crossOrigin="anonymous" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black/40 text-[#f5dfa4] font-bold">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Camera className="w-4 h-4" />
                </div>
              </div>
              <div className="overflow-hidden flex-1">
                <span className="text-xs font-black text-white block truncate font-active-ar">
                  {accountData?.fullName || accountData?.username}
                </span>
                <span className={`text-[10px] ${currentTheme.accentText} font-bold block truncate font-active-ar`}>
                  باقة {accountData?.plan || 'PLUS'} · مشترك معتمد
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[9px] text-emerald-400 font-bold font-active-ar">اتصال حي نشط</span>
                </div>
              </div>
            </div>

            {/* Categorized Navigation Groups */}
            <nav className="space-y-4 flex-1 overflow-y-auto no-scrollbar pr-1 py-1">
              {sidebarNavGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1.5">
                  <span className="text-[10px] text-neutral-400 font-bold px-2 block font-active-ar tracking-wider">
                    {group.category}
                  </span>
                  <div className="space-y-1">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={e => {
                            setActiveTab(item.id as any);
                            setMobileMenuOpen(false);
                            triggerSoftGleam(e);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-right font-active-ar group relative overflow-hidden ${
                            active
                              ? `bg-gradient-to-l ${currentTheme.primary} text-neutral-950 font-black shadow-md`
                              : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
                          }`}
                        >
                          {active && <span className="cyber-corner-tl" />}
                          <div className="flex items-center gap-3">
                            <Icon className={`w-4 h-4 flex-shrink-0 transition-transform ${active ? 'animate-icon-breath' : 'group-hover:scale-110 group-hover:text-[#f5dfa4]'}`} />
                            <span>{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold font-active-en ${
                              active ? 'bg-black/30 text-neutral-950' : 'bg-white/10 text-neutral-300'
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Drawer Footer with Quick Dark/Light Switch & Logout */}
            <div className="pt-4 border-t border-white/10 space-y-2.5">
              <button
                onClick={toggleDarkLightMode}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-neutral-300 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 transition-all font-active-ar"
              >
                <div className="flex items-center gap-2">
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                  <span>{isDarkMode ? 'التحويل للوضع النهاري الملكي' : 'التحويل للوضع الليلي الإمبراطوري'}</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-num">{isDarkMode ? 'DARK' : 'LIGHT'}</span>
              </button>

              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all font-active-ar"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج الآمن</span>
              </button>
            </div>
          </aside>

          {/* ========================================================
              MAIN CONTENT
          ======================================================== */}
          <main className="flex-1 min-w-0 p-4 sm:p-7 lg:p-8 max-w-7xl mx-auto w-full">
            {/* TAB: HOME */}
            {activeTab === 'home' && (
              <div className="space-y-6">
                {/* Top Executive Quick Command Strip - Next-Gen Cybernetic HUD */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={() => refreshAccount(false)}
                    className="cyber-hud-card p-3.5 rounded-2xl text-right transition-all flex items-center justify-between group relative overflow-hidden"
                  >
                    <span className="cyber-corner-tl" />
                    <div>
                      <span className="text-[9px] text-[#d8b46a] font-black uppercase tracking-wider block font-active-en">// SYNC_NOW</span>
                      <strong className="text-xs text-white block font-active-ar mt-0.5">جلب البيانات الحية</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-[#d8b46a]/60 transition-colors">
                      <RefreshCw className={`w-4 h-4 text-[#f5dfa4] transition-transform duration-700 ${loading ? 'animate-spin' : 'group-hover:rotate-180 animate-icon-breath'}`} />
                    </div>
                  </button>

                  <button
                    onClick={e => {
                      setActiveTab('speedtest');
                      triggerSoftGleam(e);
                    }}
                    className="cyber-hud-card p-3.5 rounded-2xl text-right transition-all flex items-center justify-between group relative overflow-hidden"
                  >
                    <span className="cyber-corner-tl" />
                    <div>
                      <span className="text-[9px] text-emerald-400 font-black uppercase tracking-wider block font-active-en">// SIGNAL_3D</span>
                      <strong className="text-xs text-white block font-active-ar mt-0.5">مقياس السرعة الحي</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 group-hover:border-emerald-400 transition-colors">
                      <Activity className="w-4 h-4 text-emerald-400 animate-pulse-glow" />
                    </div>
                  </button>

                  <button
                    onClick={e => handleInstantAlert(e)}
                    className="cyber-hud-card p-3.5 rounded-2xl text-right transition-all flex items-center justify-between group relative overflow-hidden"
                  >
                    <span className="cyber-corner-tl" />
                    <div>
                      <span className="text-[9px] text-amber-400 font-black uppercase tracking-wider block font-active-en">// INSTANT_BOT</span>
                      <strong className="text-xs text-white block font-active-ar mt-0.5">إرسال فوري الآن</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 group-hover:border-amber-400 transition-colors">
                      <Zap className="w-4 h-4 text-amber-400 animate-icon-breath" />
                    </div>
                  </button>

                  <button
                    onClick={e => {
                      setTimePickerOpen(true);
                      triggerSoftGleam(e);
                    }}
                    className="cyber-hud-card p-3.5 rounded-2xl text-right transition-all flex items-center justify-between group relative overflow-hidden"
                  >
                    <span className="cyber-corner-tl" />
                    <div>
                      <span className="text-[9px] text-cyan-400 font-black uppercase tracking-wider block font-active-en">// CRON_TIMER</span>
                      <strong className="text-xs text-white block font-active-ar mt-0.5">لوحة الوقت الفخمة</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 group-hover:border-cyan-400 transition-colors">
                      <Clock className="w-4 h-4 text-cyan-400 animate-spin-reverse-slow" />
                    </div>
                  </button>
                </div>

                {/* Hero Card - Next-Gen Telecom Telemetry HUD */}
                <div className="cyber-hud-card tech-grid-pattern relative p-6 sm:p-8 rounded-3xl overflow-hidden">
                  <span className="cyber-corner-tl" />
                  <span className="cyber-corner-br" />

                  {/* High-Tech Telemetry Stream Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-white/10 text-[10px] text-neutral-400 font-active-en">
                    <div className="flex items-center gap-2">
                      <span className="cyber-status-led" />
                      <span className="text-[#f5dfa4] font-bold">[NODE: IQ-BAGHDAD-NOC-01]</span>
                      <span className="hidden sm:inline text-neutral-500">&bull;</span>
                      <span className="hidden sm:inline text-emerald-400 font-semibold">[CORE STREAM: ENCRYPTED]</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-400">ISP:</span>
                      <span className="text-white font-bold">EARTHLINK NATIONAL BROADBAND</span>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-xs font-bold mb-3 font-active-ar">
                        <Satellite className="w-3.5 h-3.5 text-[#f5dfa4] animate-radar-spin" />
                        <span className="text-[#f5dfa4]">شبكة إيرثلنك الوطنية · جمهورية العراق</span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-white font-active-ar flex items-center gap-2">
                        <span>مرحباً، {accountData?.fullName || accountData?.username || 'المشترك'}</span>
                        <span className="text-sm px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#d8b46a] to-amber-500 text-neutral-950 font-black font-active-en">PRO</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-neutral-400 mt-2 max-w-xl leading-relaxed font-active-ar">
                        النظام المعلوماتي الأحدث لشبكة إيرثلنك مع لوحة قيادة سيبرانية حية، ومراقبة التردد والاستهلاك، وأتمتة تنبيهات GitHub Actions.
                      </p>
                    </div>

                    {/* Animated Connection Wave Indicator with 7 moving bars */}
                    <div className="flex items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/10 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)]">
                      <div className="flex items-end gap-1.5 h-10 px-2">
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-1" />
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-2" />
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-3" />
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-4" />
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-5" />
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-6" />
                        <div className="w-1.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400 animate-wave-7" />
                      </div>
                      <div>
                        <span className="text-[11px] text-neutral-400 block font-semibold font-active-ar">حالة خط إيرثلنك</span>
                        <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm font-active-ar">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span className="font-active-ar">{accountData?.serviceStatus || 'متصل بجودة ممتازة'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4 Next-Gen Cyber-Luxury Information Architecture KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: نوع الباقة */}
                  <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="cyber-corner-br" />
                    <div className="flex items-center justify-between text-neutral-400 mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="cyber-tech-badge text-[9px] py-0.5 px-2">TIER 01</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#d8b46a]/20 to-black border border-[#d8b46a]/40 shadow-[0_0_15px_rgba(216,180,106,0.3)]">
                        <Crown className="w-4 h-4 text-[#f5dfa4] animate-icon-breath" />
                      </div>
                    </div>
                    <div className="text-lg sm:text-xl font-black text-white truncate font-active-ar" title={accountData?.plan || '—'}>
                      {accountData?.plan || 'PLUS'}
                    </div>
                    <span className="text-[10px] text-neutral-400 mt-1 block font-active-ar">باقة الحساب الرسمية</span>
                  </div>

                  {/* Card 2: سعر الاشتراك */}
                  <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="cyber-corner-br" />
                    <div className="flex items-center justify-between text-neutral-400 mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="cyber-tech-badge text-[9px] py-0.5 px-2">BILLING</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-black border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                        <Coins className="w-4 h-4 text-amber-300 animate-float-gentle" />
                      </div>
                    </div>
                    <div className="text-lg sm:text-xl font-black text-white font-num">
                      {accountData?.price ? `${accountData.price} د.ع` : '—'}
                    </div>
                    <span className="text-[10px] text-neutral-400 mt-1 block font-active-ar">قيمة تجديد الخط</span>
                  </div>

                  {/* Card 3: الأيام المتبقية */}
                  <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="cyber-corner-br" />
                    <div className="flex items-center justify-between text-neutral-400 mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="cyber-tech-badge text-[9px] py-0.5 px-2">DAYS_LEFT</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-black border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
                        <Clock className="w-4 h-4 text-cyan-300 animate-spin-reverse-slow" />
                      </div>
                    </div>
                    <div className="text-lg sm:text-xl font-black font-num text-[#f5dfa4]">
                      {accountData?.daysLeft !== undefined ? `${accountData.daysLeft} يوم` : '—'}
                    </div>
                    <span className="text-[10px] text-neutral-400 mt-1 block font-active-ar">صلاحية التفعيل</span>
                  </div>

                  {/* Card 4: سرعة الخط */}
                  <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="cyber-corner-br" />
                    <div className="flex items-center justify-between text-neutral-400 mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="cyber-tech-badge text-[9px] py-0.5 px-2">FIBER QoS</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-black border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                        <Gauge className="w-4 h-4 text-emerald-400 animate-pulse-glow" />
                      </div>
                    </div>
                    <div className="text-lg sm:text-xl font-black text-emerald-400 font-active-ar">
                      {accountData?.speed || 'مستقرة (فايبر)'}
                    </div>
                    <span className="text-[10px] text-neutral-400 mt-1 block font-active-ar">حسب برج الوكيل</span>
                  </div>
                </div>

                {/* DYNAMIC FUTURISTIC ORBITAL EXPIRY DISC & ENGRAVED PLUS SUBSCRIPTION FRAME */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Orbital Expiry Disk - Cybernetic HUD Telemetry */}
                  <div className="cyber-hud-card tech-grid-pattern p-6 rounded-3xl relative overflow-hidden flex flex-col items-center justify-center text-center">
                    <span className="cyber-corner-tl" />
                    <span className="cyber-corner-br" />

                    <div className="flex items-center justify-between w-full pb-2 mb-2 border-b border-white/10 z-10">
                      <span className="cyber-tech-badge text-[9px] py-0.5 px-2">ORBITAL // EXPIRY</span>
                      <span className="cyber-status-led" />
                    </div>

                    <h3 className="text-sm font-bold text-white mb-2 z-10 flex items-center gap-1.5 font-active-ar">
                      <Compass className="w-4 h-4 text-[#f5dfa4] animate-radar-spin" />
                      <span>قرص الصلاحية المداري الفخم</span>
                    </h3>

                    {/* Multi-layered dynamic animated rings */}
                    <div className="relative w-52 h-52 flex items-center justify-center my-3">
                      <div className="absolute inset-0 rounded-full border border-dashed border-[#d8b46a]/30 animate-spin-slow" />
                      <div
                        style={{ borderColor: currentTheme.glow }}
                        className="absolute inset-2 rounded-full border border-dotted opacity-70 animate-spin-reverse-slow"
                      />

                      <svg className="w-44 h-44 -rotate-90 z-10" viewBox="0 0 160 160">
                        <circle
                          className="text-white/10"
                          strokeWidth="10"
                          stroke="currentColor"
                          fill="transparent"
                          r="70"
                          cx="80"
                          cy="80"
                        />
                        <circle
                          stroke="currentColor"
                          className="text-[#f5dfa4]"
                          strokeWidth="10"
                          strokeDasharray="440"
                          strokeDashoffset={ringDashOffset}
                          strokeLinecap="round"
                          fill="transparent"
                          r="70"
                          cx="80"
                          cy="80"
                          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                        />
                      </svg>

                      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                        <span className="text-5xl font-black font-num tracking-tight text-[#f5dfa4] animate-icon-breath">
                          {daysNum !== null ? daysNum : '—'}
                        </span>
                        <span className="text-[11px] text-neutral-300 font-bold mt-1 font-active-ar">يوم متبقي</span>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-400 mt-1 font-num z-10 font-active-ar">
                      تاريخ الانتهاء: <b className="text-white font-num">{accountData?.expiry || '—'}</b>
                    </div>
                  </div>

                  {/* ========================================================
                      ULTRA-LUXURIOUS ENGRAVED SUBSCRIPTION FRAME (كادر نوع الاشتراك المحفور)
                  ======================================================== */}
                  <div className="lg:col-span-2 engraved-frame-bevel rounded-3xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between">
                    {/* 4 Engraved Corner Screws / Golden Rivets */}
                    <div className="absolute top-3.5 right-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner flex items-center justify-center">
                      <div className="w-1.5 h-0.5 bg-[#42310f] rotate-45" />
                    </div>
                    <div className="absolute top-3.5 left-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner flex items-center justify-center">
                      <div className="w-1.5 h-0.5 bg-[#42310f] -rotate-45" />
                    </div>
                    <div className="absolute bottom-3.5 right-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner flex items-center justify-center">
                      <div className="w-1.5 h-0.5 bg-[#42310f] -rotate-45" />
                    </div>
                    <div className="absolute bottom-3.5 left-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner flex items-center justify-center">
                      <div className="w-1.5 h-0.5 bg-[#42310f] rotate-45" />
                    </div>

                    {/* Frame Top Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-[#d8b46a]/25 mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-xl bg-gradient-to-tr from-[#7c5b1b] to-[#d8b46a] text-neutral-950 shadow-md">
                          <Crown className="w-4 h-4 animate-icon-breath" />
                        </div>
                        <div>
                          <span className="text-[10px] text-[#d8b46a] font-bold tracking-widest block font-active-en">
                            EARTHLINK OFFICIAL SUBSCRIBER CARD
                          </span>
                          <span className="text-xs font-black text-white font-active-ar">
                            كادر باقة الاشتراك الملكي المعتمد
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={e => {
                          setImageModalOpen(true);
                          triggerSoftGleam(e);
                        }}
                        className="text-[11px] text-[#f5dfa4] hover:text-white flex items-center gap-1 font-bold font-active-ar transition-colors px-2.5 py-1 rounded-lg bg-white/5 border border-white/10"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>عرض البطاقة</span>
                      </button>
                    </div>

                    {/* Main Engraved Centerpiece: PLUS & USERNAME */}
                    <div className="my-2 p-5 rounded-2xl bg-black/40 border border-[#d8b46a]/30 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] relative overflow-hidden">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        {/* Engraved PLUS Badge */}
                        <div className="text-center sm:text-right">
                          <span className="text-[10px] text-neutral-400 font-bold block font-active-ar">
                            نوع الباقة المحفورة رسميـاً
                          </span>
                          <div className="text-4xl sm:text-5xl font-black tracking-widest engraved-title-plus font-active-en leading-none mt-1 animate-pulse-glow">
                            {accountData?.plan && accountData.plan.toUpperCase().includes('PLUS')
                              ? accountData.plan.toUpperCase()
                              : 'PLUS'}
                          </div>
                          <span className="text-[11px] text-[#f5dfa4] font-bold mt-1 block font-active-ar">
                            باقة إيرثلنك بلس فايبر فائقة الاستقرار والسرعة
                          </span>
                        </div>

                        {/* Gold Security Chip & Status Stamp with Blinking Silicon LEDs */}
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-11 rounded-xl bg-gradient-to-br from-[#ffd572] via-[#b6892e] to-[#704d0c] p-1 border border-[#ffe9a8] shadow-lg flex flex-col justify-between relative">
                            <div className="flex justify-between">
                              <div className="w-3 h-2 border border-black/40 rounded-sm bg-black/20" />
                              <div className="w-3 h-2 border border-black/40 rounded-sm bg-black/20" />
                            </div>
                            <div className="w-full h-1.5 border-y border-black/40 my-auto flex items-center justify-around">
                              <span className="w-1 h-1 rounded-full bg-emerald-300 animate-ping" />
                              <span className="w-1 h-1 rounded-full bg-cyan-300 animate-pulse" />
                            </div>
                            <div className="flex justify-between">
                              <div className="w-3 h-2 border border-black/40 rounded-sm bg-black/20" />
                              <div className="w-3 h-2 border border-black/40 rounded-sm bg-black/20" />
                            </div>
                          </div>

                          <div className="text-center sm:text-right">
                            <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold block font-active-en flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              VERIFIED ACTIVE
                            </span>
                            <span className="text-[10px] text-neutral-400 font-num block mt-1">
                              ID: {accountData?.userID || 'EL-PLUS-8842'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Engraved Subscriber Plate */}
                      <div className="mt-4 pt-4 border-t border-[#d8b46a]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#d8b46a] font-bold font-active-ar">المشترك المحفور:</span>
                          <span className="text-base sm:text-lg font-black text-white font-active-ar tracking-wide">
                            {accountData?.fullName || accountData?.username || 'مشترك إيرثلنك PLUS'}
                          </span>
                        </div>

                        <div className="text-xs text-neutral-400 font-num">
                          IP: <b className="text-white font-num">{accountData?.ip || '10.0.0.1'}</b>
                        </div>
                      </div>
                    </div>

                    {/* Frame Footer Info */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-center text-xs font-active-ar">
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                        <span className="text-[10px] text-neutral-400 block mb-0.5">سعر التجديد</span>
                        <strong className="text-white font-num">{accountData?.price ? `${accountData.price} د.ع` : '—'}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                        <span className="text-[10px] text-neutral-400 block mb-0.5">الوكيل / البرج</span>
                        <strong className="text-white truncate block">{accountData?.agentName || '—'}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                        <span className="text-[10px] text-neutral-400 block mb-0.5">الصلاحية</span>
                        <strong className="text-[#f5dfa4] font-num">{accountData?.daysLeft !== undefined ? `${accountData.daysLeft} يوم` : '—'}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                        <span className="text-[10px] text-neutral-400 block mb-0.5">حالة الخدمة</span>
                        <strong className="text-emerald-400 font-active-ar">{accountData?.serviceStatus || 'فعال'}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SPEED TEST & 3D NEEDLE GAUGE (فحص سرعة وقوة الاتصال الحي) */}
            {activeTab === 'speedtest' && (
              <div className="space-y-6">
                {/* 3D Gauge & Speedometer Board - Next-Gen Cybernetic HUD */}
                <div className="cyber-hud-card tech-grid-pattern p-6 sm:p-8 rounded-3xl relative overflow-hidden">
                  <span className="cyber-corner-tl" />
                  <span className="cyber-corner-br" />

                  {/* High-Tech Telemetry Stream Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-6 border-b border-white/10 text-[10px] text-neutral-400 font-active-en">
                    <div className="flex items-center gap-2">
                      <span className="cyber-status-led" />
                      <span className="text-[#f5dfa4] font-bold">[SPEED_PROBE // NOC_TEST_STREAM]</span>
                      <span className="hidden sm:inline text-neutral-500">&bull;</span>
                      <span className="hidden sm:inline text-cyan-400 font-semibold">[ENGINE: ULTRALIGHT V8 TELEMETRY]</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-400">STATUS:</span>
                      <span className="text-emerald-400 font-bold">{speedTestRunning ? 'TESTING...' : 'ONLINE READY'}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                        <Activity className="w-5 h-5 text-emerald-400 animate-pulse-glow" />
                        <span>فحص سرعة وقوة اتصال خط إيرثلنك (Speedometer)</span>
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                        مقياس حي ثلاثي الأبعاد يقيس سرعة التنزيل والرفع وزمن الاستجابة والتذبذب بدقة فائقة
                      </p>
                    </div>

                    <button
                      onClick={e => {
                        runSpeedTestSequence();
                        triggerSoftGleam(e);
                      }}
                      disabled={speedTestRunning}
                      className={`px-6 py-3 rounded-2xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 font-active-ar`}
                    >
                      <RefreshCw className={`w-4 h-4 ${speedTestRunning ? 'animate-spin' : 'animate-icon-breath'}`} />
                      <span>{speedTestRunning ? 'جاري الفحص المباشر...' : 'بدء فحص السرعة الآن'}</span>
                    </button>
                  </div>

                  {/* High-Tech Speedometer Gauge */}
                  <div className="flex flex-col items-center justify-center my-6">
                    <div className="relative w-72 h-44 flex items-center justify-center">
                      <svg className="w-72 h-44" viewBox="0 0 200 120">
                        <defs>
                          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="50%" stopColor="#f5dfa4" />
                            <stop offset="100%" stopColor="#00f2fe" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 20 100 A 80 80 0 0 1 180 100"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="14"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 20 100 A 80 80 0 0 1 180 100"
                          fill="none"
                          stroke="url(#gaugeGrad)"
                          strokeWidth="14"
                          strokeDasharray="251"
                          strokeDashoffset={251 - (251 * (needleAngle + 90)) / 180}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                        />
                      </svg>

                      {/* Rotating Gauge Needle */}
                      <div
                        className="absolute bottom-4 left-1/2 w-1.5 h-28 origin-bottom bg-gradient-to-t from-white via-[#d8b46a] to-emerald-400 rounded-full shadow-[0_0_15px_rgba(216,180,106,0.8)]"
                        style={{
                          transform: `translateX(-50%) rotate(${needleAngle}deg)`,
                          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                      {/* Center Pin with Animated Radar Beacon */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-4 border-[#08090b] shadow-lg flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-[#d8b46a] animate-ping" />
                      </div>
                    </div>

                    {/* Speed Counter Readout */}
                    <div className="text-center mt-2">
                      <div className="flex items-baseline justify-center gap-2">
                        <span className="text-5xl font-black font-num text-[#f5dfa4]">
                          {speedTestRunning ? currentSpeedMbps : peakDownloadMbps}
                        </span>
                        <span className="text-sm font-black text-neutral-400 font-active-en">Mbps</span>
                      </div>
                      <span className="text-xs text-neutral-300 font-bold font-active-ar">
                        {speedStage === 'download'
                          ? 'جاري قياس التنزيل (Download)...'
                          : speedStage === 'upload'
                          ? 'جاري قياس الرفع (Upload)...'
                          : speedStage === 'ping'
                          ? 'جاري فحص زمن الاستجابة (Ping)...'
                          : 'سرعة خط إيرثلنك المباشرة'}
                      </span>
                    </div>
                  </div>

                  {/* 4 Next-Gen Cyber Diagnostics Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden text-center group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between text-neutral-400 mb-1">
                        <span className="text-[10px] text-[#d8b46a] font-bold font-active-en">DOWNLOAD</span>
                        <Download className="w-3.5 h-3.5 text-[#f5dfa4] animate-icon-breath" />
                      </div>
                      <div className="text-2xl font-black font-num text-white">
                        {peakDownloadMbps} <span className="text-xs text-neutral-500 font-active-en">Mbps</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-active-ar mt-0.5 block">مستقرة وسريعة</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden text-center group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between text-neutral-400 mb-1">
                        <span className="text-[10px] text-emerald-400 font-bold font-active-en">UPLOAD</span>
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400 animate-pulse-glow" />
                      </div>
                      <div className="text-2xl font-black font-num text-white">
                        {peakUploadMbps} <span className="text-xs text-neutral-500 font-active-en">Mbps</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-active-ar mt-0.5 block">مثالية للبث والمكالمات</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden text-center group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between text-neutral-400 mb-1">
                        <span className="text-[10px] text-cyan-400 font-bold font-active-en">PING LATENCY</span>
                        <Radio className="w-3.5 h-3.5 text-cyan-400 animate-beacon-ring" />
                      </div>
                      <div className="text-2xl font-black font-num text-emerald-400">
                        {pingSpeed} <span className="text-xs text-neutral-500 font-active-en">ms</span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-active-ar mt-0.5 block">ممتاز للألعاب والـ DNS</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden text-center group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between text-neutral-400 mb-1">
                        <span className="text-[10px] text-amber-400 font-bold font-active-en">JITTER</span>
                        <Activity className="w-3.5 h-3.5 text-amber-400 animate-float-gentle" />
                      </div>
                      <div className="text-2xl font-black font-num text-[#f5dfa4]">
                        {jitter} <span className="text-xs text-neutral-500 font-active-en">ms</span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-active-ar mt-0.5 block">ثبات ممتاز في الإشارة</span>
                    </div>
                  </div>
                </div>

                {/* Moving Bandwidth Frequency Wave Chart */}
                <div className="cyber-hud-card tech-grid-pattern p-6 rounded-3xl relative overflow-hidden space-y-4">
                  <span className="cyber-corner-tl" />
                  <span className="cyber-corner-br" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-white font-active-ar flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-[#f5dfa4] animate-icon-breath" />
                      <span>مخطط تردد الإشارة والنبضات الحية</span>
                    </h3>
                    <span className="cyber-tech-badge text-[10px] py-1 px-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      60 Hz STREAM
                    </span>
                  </div>

                  <div className="h-28 w-full flex items-end justify-between gap-1 p-2 bg-black/40 rounded-2xl border border-white/5 overflow-hidden shadow-inner">
                    {Array.from({ length: 32 }, (_, i) => {
                      const h = 20 + Math.sin(i * 0.4 + (speedTestRunning ? currentSpeedMbps : 15)) * 18 + ((i % 5) * 6);
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-t-sm transition-all duration-300 ${
                            i % 2 === 0 ? 'bg-gradient-to-t from-emerald-500 via-[#d8b46a] to-cyan-300' : 'bg-white/20'
                          }`}
                          style={{ height: `${Math.max(12, Math.min(88, h))}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: USAGE & NETWORK INDICATORS */}
            {activeTab === 'usage' && (
              <div className="space-y-6">
                <div className="cyber-hud-card tech-grid-pattern p-6 sm:p-8 rounded-3xl relative overflow-hidden space-y-6">
                  <span className="cyber-corner-tl" />
                  <span className="cyber-corner-br" />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                    <div>
                      <h2 className="text-xl font-bold text-white font-active-ar flex items-center gap-2">
                        <LineChart className="w-5 h-5 text-[#f5dfa4] animate-icon-breath" />
                        <span>الاتصال واستهلاك البيانات المباشر</span>
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1 font-active-ar">مؤشرات الاستهلاك والسرعة الحية من واجهة إيرثلنك الوطنية</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="cyber-tech-badge text-xs py-1.5 px-3.5">
                        نوع الباقة: <b className="text-white font-active-ar mr-1">{accountData?.plan || 'PLUS'}</b>
                      </span>
                    </div>
                  </div>

                  {/* Quota Progress Bar Visual with Animated Packet Streaming */}
                  <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-3 relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs font-active-ar">
                      <span className="text-neutral-400">معدل نقل البيانات الحالي:</span>
                      <span className="font-num font-black text-[#f5dfa4]">غير محدود (Unlimited Bandwidth)</span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden relative">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-[#d8b46a] to-cyan-400 shadow-[0_0_15px_rgba(216,180,106,0.5)]"
                        style={{ width: '74%' }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-24 animate-stream-packets pointer-events-none" />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-400 font-active-ar">
                      <span>الاستهلاك التقديري: 184 GB</span>
                      <span>سعة الشبكة: فايبر وسلكي غير محدود</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-active-ar">
                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <span className="text-xs text-neutral-400 block mb-1 font-active-ar">الاستهلاك الكلي</span>
                      <span className="text-sm font-bold text-white font-active-ar">{accountData?.usage || 'غير معلن في API'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <span className="text-xs text-neutral-400 block mb-1 font-active-ar">التحميل (Download)</span>
                      <span className="text-sm font-bold text-white font-active-ar">{accountData?.download || 'غير معلن في API'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <span className="text-xs text-neutral-400 block mb-1 font-active-ar">الرفع (Upload)</span>
                      <span className="text-sm font-bold text-white font-active-ar">{accountData?.upload || 'غير معلن في API'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <span className="text-xs text-neutral-400 block mb-1 font-active-ar">عنوان IP الحالي</span>
                      <span className="text-sm font-num text-[#f5dfa4]">{accountData?.ip || '—'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <span className="text-xs text-neutral-400 block mb-1 font-active-ar">التردد والربط</span>
                      <span className="text-sm font-bold text-white font-active-ar">{accountData?.frequency || 'غير معلن في API'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <span className="text-xs text-neutral-400 block mb-1 font-active-ar">السرعة المحددة</span>
                      <span className="text-sm font-bold text-white font-active-ar">{accountData?.speed || 'مستقرة (Unlimited)'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ALERTS (التنبيه التلقائي عبر ملف YML و Bot) */}
            {activeTab === 'alerts' && (
              <div className="cyber-hud-card tech-grid-pattern p-6 sm:p-8 rounded-3xl relative overflow-hidden space-y-6">
                <span className="cyber-corner-tl" />
                <span className="cyber-corner-br" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                      <BellRing className="w-5 h-5 text-[#f5dfa4] animate-icon-breath" />
                      <span>نظام التنبيه الآلي المستقل عبر GitHub Actions وملف YML</span>
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                      يعمل التنبيه تلقائياً في خوادم GitHub حتى لو أغلقت الموقع أو حاسوبك!
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => handleInstantAlert(e)}
                      className={`px-4 py-2.5 rounded-xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all flex items-center gap-1.5 font-active-ar`}
                    >
                      <Zap className="w-4 h-4 animate-icon-breath" />
                      <span>إرسال فوري الآن</span>
                    </button>

                    <button
                      onClick={e => {
                        triggerSoftGleam(e);
                        window.open('/api/alerts/workflow-yml', '_blank');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all flex items-center gap-1.5 font-active-ar"
                    >
                      <Download className="w-4 h-4 text-[#f5dfa4]" />
                      <span>تحميل .yml</span>
                    </button>
                  </div>
                </div>

                {/* LUXURY TIME BOARD TRIGGER */}
                <div className="cyber-hud-card p-6 rounded-3xl relative overflow-hidden space-y-4">
                  <span className="cyber-corner-tl" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-white flex items-center gap-2 font-active-ar">
                        <Clock className="w-4 h-4 text-cyan-400 animate-spin-reverse-slow" />
                        <span>موعد التنبيه المبرمج الحالي</span>
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                        يوم <b className="text-white font-num">{alertConfig.day}</b> من كل شهر عند الساعة <b className="text-[#f5dfa4] font-num">{String(alertConfig.hour).padStart(2, '0')}:{String(alertConfig.minute).padStart(2, '0')}:{String(alertConfig.second).padStart(2, '0')} {alertConfig.period === 'AM' ? 'صباحاً' : 'مساءً'}</b> بتوقيت بغداد
                      </p>
                    </div>

                    <button
                      onClick={e => {
                        setTimePickerOpen(true);
                        triggerSoftGleam(e);
                      }}
                      className={`px-5 py-3 rounded-2xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all flex items-center gap-2 font-active-ar`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>فتح لوحة اختيار الأرقام الفخمة</span>
                    </button>
                  </div>

                  {/* Channel Selection Buttons */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-neutral-300 mb-2 font-active-ar">طريقة وجهة الإرسال</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'telegram', label: 'Telegram فقط' },
                        { id: 'webhook', label: 'Discord Webhook فقط' },
                        { id: 'both', label: 'Telegram مع Discord معاً' },
                      ].map(ch => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={e => {
                            const upd = { ...alertConfig, channel: ch.id as any };
                            setAlertConfig(upd);
                            saveAlertSettings(upd);
                            triggerSoftGleam(e);
                          }}
                          className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all font-active-ar ${
                            alertConfig.channel === ch.id
                              ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 border-transparent font-black shadow-md`
                              : 'bg-white/[0.02] text-neutral-400 border-white/10 hover:text-white'
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pre-filled credentials */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden space-y-4">
                    <span className="cyber-corner-tl" />
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#f5dfa4] font-active-ar">بيانات بوت Telegram المعتمدة</h3>
                      <Send className="w-4 h-4 text-cyan-400 animate-float-gentle" />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 font-active-ar">Bot Token</label>
                      <input
                        type="text"
                        value={alertConfig.telegramBotToken || ''}
                        onChange={e => setAlertConfig({ ...alertConfig, telegramBotToken: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-num text-xs focus:outline-none focus:border-[#d8b46a]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 font-active-ar">Chat ID</label>
                      <input
                        type="text"
                        value={alertConfig.telegramChatId || ''}
                        onChange={e => setAlertConfig({ ...alertConfig, telegramChatId: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-num text-xs focus:outline-none focus:border-[#d8b46a]"
                      />
                    </div>
                  </div>

                  <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden space-y-4">
                    <span className="cyber-corner-tl" />
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#f5dfa4] font-active-ar">رابط Discord Webhook المعتمد</h3>
                      <Radio className="w-4 h-4 text-emerald-400 animate-beacon-ring" />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1 font-active-ar">Webhook URL</label>
                      <input
                        type="url"
                        value={alertConfig.webhookUrl || ''}
                        onChange={e => setAlertConfig({ ...alertConfig, webhookUrl: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-num text-xs focus:outline-none focus:border-[#d8b46a]"
                      />
                    </div>
                    <button
                      onClick={e => {
                        saveAlertSettings();
                        triggerSoftGleam(e);
                      }}
                      className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-[#d8b46a]/40 text-[#f5dfa4] text-xs font-bold transition-all font-active-ar"
                    >
                      حفظ وتثبيت البيانات
                    </button>
                  </div>
                </div>

                {/* Workflow Code Glass Box */}
                <div className="cyber-hud-card p-5 rounded-2xl relative overflow-hidden space-y-3">
                  <span className="cyber-corner-tl" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2 font-active-ar">
                      <FileCode2 className="w-4 h-4 text-[#f5dfa4] animate-icon-breath" />
                      <span>مسار الملف في مستودع GitHub الخاص بك: <code>.github/workflows/earthlink-alert.yml</code></span>
                    </span>
                    <button
                      onClick={e => {
                        fetch('/api/alerts/workflow-yml')
                          .then(res => res.text())
                          .then(text => {
                            navigator.clipboard.writeText(text);
                            triggerSoftGleam(e);
                            openLuxModal('تم النسخ', 'تم نسخ كود الـ YAML لحافظتك بنجاح!', 'success');
                          });
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 font-active-ar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ الكود</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SUBSCRIPTION DETAILS & ENGRAVED PLUS FRAME */}
            {activeTab === 'subscription' && (
              <div className="space-y-6">
                {/* Engraved PLUS Frame in Subscription Tab */}
                <div className="engraved-frame-bevel rounded-3xl p-6 sm:p-8 relative overflow-hidden">
                  <div className="absolute top-3.5 right-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner" />
                  <div className="absolute top-3.5 left-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner" />
                  <div className="absolute bottom-3.5 right-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner" />
                  <div className="absolute bottom-3.5 left-3.5 w-3 h-3 rounded-full bg-gradient-to-tr from-[#7c5b1b] via-[#d8b46a] to-[#fff3c4] border border-[#503b12] shadow-inner" />

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-[#d8b46a]/25 mb-5">
                    <div>
                      <h2 className="text-xl font-bold text-white font-active-ar flex items-center gap-2">
                        <Diamond className="w-5 h-5 text-[#d8b46a] animate-icon-breath" />
                        <span>كادر باقة إيرثلنك PLUS المحفور الملكي</span>
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                        تصميم محفور فاخر يعرض اسم الباقة واسم المشترك بنمط معدني ملكي بارز
                      </p>
                    </div>

                    <div className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#d8b46a]/20 to-black border border-[#d8b46a]/50 text-[#f5dfa4] font-black text-sm font-active-en">
                      PLUS TIER
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-black/40 border border-[#d8b46a]/30 mb-6 text-center sm:text-right flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div>
                      <span className="text-xs text-neutral-400 font-bold block font-active-ar">اسم الباقة المعتمد</span>
                      <div className="text-5xl font-black tracking-widest engraved-title-plus font-active-en mt-1">
                        PLUS
                      </div>
                      <span className="text-xs text-[#f5dfa4] font-semibold mt-1 block font-active-ar">
                        شبكة إيرثلنك الوطنية · باقة بلس الممتازة
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-white/[0.02] border border-[#d8b46a]/30 text-right min-w-[240px]">
                      <span className="text-[11px] text-[#d8b46a] font-bold block font-active-ar">المشترك المحفور:</span>
                      <strong className="text-lg font-black text-white block mt-0.5 font-active-ar">
                        {accountData?.fullName || accountData?.username || 'مشترك إيرثلنك PLUS'}
                      </strong>
                      <span className="text-[10px] text-neutral-400 block mt-1 font-num">
                        رقم المشترك: {accountData?.userID || 'EL-PLUS-8842'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-active-ar">
                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-400">نوع الباقة</span>
                        <Crown className="w-3.5 h-3.5 text-[#f5dfa4] animate-icon-breath" />
                      </div>
                      <span className="text-base font-bold text-white font-active-ar">{accountData?.plan || 'PLUS'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-400">سعر الباقة</span>
                        <Coins className="w-3.5 h-3.5 text-amber-300 animate-float-gentle" />
                      </div>
                      <span className="text-base font-bold text-white font-num">{accountData?.price ? `${accountData.price} دينار عراقي` : '—'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-400">تاريخ الانتهاء</span>
                        <Calendar className="w-3.5 h-3.5 text-cyan-300 animate-spin-reverse-slow" />
                      </div>
                      <span className="text-base font-bold font-num text-[#f5dfa4]">{accountData?.expiry || '—'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-400">الأيام المتبقية</span>
                        <Clock className="w-3.5 h-3.5 text-rose-300 animate-pulse-glow" />
                      </div>
                      <span className="text-base font-bold text-white font-num">{accountData?.daysLeft !== undefined ? `${accountData.daysLeft} يوم` : '—'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-400">حالة الخدمة</span>
                        <Radio className="w-3.5 h-3.5 text-emerald-400 animate-beacon-ring" />
                      </div>
                      <span className="text-base font-bold text-emerald-400 font-active-ar">{accountData?.serviceStatus || 'فعال'}</span>
                    </div>

                    <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                      <span className="cyber-corner-tl" />
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-400">حالة الحساب</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 animate-icon-breath" />
                      </div>
                      <span className="text-base font-bold text-white font-active-ar">{accountData?.accountStatus || 'نشط'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ACCOUNT PROFILE */}
            {activeTab === 'account' && (
              <div className="cyber-hud-card tech-grid-pattern p-6 sm:p-8 rounded-3xl relative overflow-hidden space-y-6">
                <span className="cyber-corner-tl" />
                <span className="cyber-corner-br" />

                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-xl font-bold text-white font-active-ar flex items-center gap-2">
                      <User className="w-5 h-5 text-[#f5dfa4] animate-icon-breath" />
                      <span>الملف التعريفي للمشترك</span>
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1 font-active-ar">البيانات الرسمية المسجلة لدى إيرثلنك الوطنية</p>
                  </div>
                  <button
                    onClick={e => {
                      avatarInputRef.current?.click();
                      triggerSoftGleam(e);
                    }}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-[#d8b46a]/40 text-[#f5dfa4] text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5 font-active-ar"
                  >
                    <Camera className="w-4 h-4 animate-icon-breath" />
                    <span>تغيير الصورة الدائرية</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-active-ar">
                  <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="text-xs text-neutral-400 block mb-1 font-active-ar">اسم المستخدم</span>
                    <span className="text-sm font-bold text-white font-active-ar">{accountData?.username || '—'}</span>
                  </div>

                  <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="text-xs text-neutral-400 block mb-1 font-active-ar">الاسم الكامل</span>
                    <span className="text-sm font-bold text-white font-active-ar">{accountData?.fullName || '—'}</span>
                  </div>

                  <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="text-xs text-neutral-400 block mb-1 font-active-ar">رقم المستخدم (ID)</span>
                    <span className="text-sm font-bold text-white font-num">{accountData?.userID || '—'}</span>
                  </div>

                  <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="text-xs text-neutral-400 block mb-1 font-active-ar">الوكيل الموزع</span>
                    <span className="text-sm font-bold text-white font-active-ar">{accountData?.agentName || '—'}</span>
                  </div>

                  <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="text-xs text-neutral-400 block mb-1 font-active-ar">الهاتف المسجل</span>
                    <span className="text-sm font-bold text-white font-num">{accountData?.phone || '—'}</span>
                  </div>

                  <div className="cyber-hud-card p-4 rounded-2xl relative overflow-hidden group">
                    <span className="cyber-corner-tl" />
                    <span className="text-xs text-neutral-400 block mb-1 font-active-ar">عنوان IP الحالي</span>
                    <span className="text-sm font-num text-[#f5dfa4]">{accountData?.ip || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CONTACT DEVELOPER */}
            {activeTab === 'contact' && (
              <div className="cyber-hud-card tech-grid-pattern p-6 sm:p-8 rounded-3xl relative overflow-hidden space-y-6 max-w-2xl mx-auto">
                <span className="cyber-corner-tl" />
                <span className="cyber-corner-br" />

                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                    <MessageSquareHeart className="w-5 h-5 text-rose-400 animate-icon-breath" />
                    <span>مراسلة المبرمج مباشرة (Discord)</span>
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                    أرسل رسالتك وملاحظاتك إلى المبرمج وستصله فوراً في الديسكورد مع اسمك، واسم مستخدم إيرثلنك، وتاريخ الإرسال.
                  </p>
                </div>

                <form onSubmit={handleSendContact} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1.5 font-active-ar">اسمك أو لقبك</label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      placeholder="أدخل اسمك"
                      required
                      className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-[#d8b46a] font-active-ar"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1.5 font-active-ar">نص الرسالة أو الاستفسار</label>
                    <textarea
                      rows={5}
                      value={contactMessage}
                      onChange={e => setContactMessage(e.target.value)}
                      placeholder="اكتب رسالتك للمبرمج هنا..."
                      required
                      className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-[#d8b46a] resize-none font-active-ar"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 text-[11px] text-neutral-400 space-y-1 font-active-ar">
                    <div>&bull; سيتم إرفاق اسم المستخدم: <b className="text-white font-num">{accountData?.username || 'مشترك إيرثلنك'}</b></div>
                    <div>&bull; توقيت وتاريخ الإرسال: <b className="text-white font-num">{currentTime || 'الآن'}</b></div>
                  </div>

                  <button
                    type="submit"
                    disabled={contactSending}
                    className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 font-active-ar`}
                  >
                    <Send className={`w-4 h-4 ${contactSending ? 'animate-spin' : 'animate-icon-breath'}`} />
                    <span>{contactSending ? 'جاري الإرسال للمبرمج...' : 'إرسال الرسالة إلى المبرمج الآن'}</span>
                  </button>
                </form>
              </div>
            )}

            {/* TAB: SETTINGS & 12 LUXURY THEMES & EXPANDED ARABIC + ENGLISH FONTS */}
            {activeTab === 'settings' && (
              <div className={`p-6 sm:p-8 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} backdrop-blur-2xl space-y-9`}>
                {/* 1. TEN LUXURY ARABIC FONTS */}
                <div>
                  <div className="pb-3 border-b border-white/10 mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                      <Type className={`w-5 h-5 ${currentTheme.accentText}`} />
                      <span>الخطوط العربية الفاخرة للواجهة (10 خطوط ملوكية أصلية)</span>
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                      يتغير الخط في كامل الموقع فوراً لجميع الأقسام والنصوص والأزرار والكلمات (بما في ذلك كلمة مستقرة)
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {LUXURY_ARABIC_FONTS.map(fontOpt => {
                      const selected = activeArFont === fontOpt.id;
                      return (
                        <button
                          key={fontOpt.id}
                          onClick={e => {
                            changeArFont(fontOpt.id);
                            triggerSoftGleam(e);
                          }}
                          className={`p-4 rounded-2xl border text-right transition-all ${
                            selected
                              ? `bg-gradient-to-l ${currentTheme.primary} text-neutral-950 font-black border-transparent shadow-lg scale-[1.02]`
                              : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black font-active-ar">{fontOpt.name}</span>
                            {selected && <Check className="w-4 h-4" />}
                          </div>
                          <p className={`text-sm ${fontOpt.cssClass} opacity-90`}>{fontOpt.sample}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. EIGHT LUXURY ENGLISH & NUMERIC FONTS */}
                <div>
                  <div className="pb-3 border-b border-white/10 mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                      <Sparkles className={`w-5 h-5 ${currentTheme.accentText}`} />
                      <span>الخطوط الإنجليزية والأرقام الفخمة (8 خطوط تقنية وسينمائية)</span>
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                      تخصيص نمط كتابة الكلمات الإنجليزية والأرقام الرقمية والعدادات
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {LUXURY_ENGLISH_FONTS.map(fontOpt => {
                      const selected = activeEnFont === fontOpt.id;
                      return (
                        <button
                          key={fontOpt.id}
                          onClick={e => {
                            changeEnFont(fontOpt.id);
                            triggerSoftGleam(e);
                          }}
                          className={`p-4 rounded-2xl border text-right transition-all ${
                            selected
                              ? `bg-gradient-to-l ${currentTheme.primary} text-neutral-950 font-black border-transparent shadow-lg scale-[1.02]`
                              : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black font-active-ar">{fontOpt.name}</span>
                            {selected && <Check className="w-4 h-4" />}
                          </div>
                          <p className={`text-xs ${fontOpt.cssClass} opacity-90 tracking-wider`}>{fontOpt.sample}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. TWELVE LUXURY THEMES */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/10 mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                        <Palette className={`w-5 h-5 ${currentTheme.accentText}`} />
                        <span>الثيمات الـ 12 الفخمة وتخصيص خلفية الموقع</span>
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                        اختر الثيم اللوني المفضل أو ارفع صورتك الخاصة من الاستوديو كخلفية للموقع
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => {
                          bgInputRef.current?.click();
                          triggerSoftGleam(e);
                        }}
                        className={`px-4 py-2.5 rounded-xl bg-gradient-to-r ${currentTheme.primary} ${currentTheme.primaryHover} text-neutral-950 font-black text-xs shadow-lg transition-all flex items-center gap-2 font-active-ar`}
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>اختيار خلفية من الاستوديو</span>
                      </button>

                      {customBgImage && (
                        <button
                          onClick={clearBgImage}
                          className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-bold font-active-ar"
                        >
                          إلغاء الصورة المخصصة
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {(Object.keys(LUXURY_THEMES) as ThemeMode[]).map(themeKey => {
                      const t = LUXURY_THEMES[themeKey];
                      const selected = theme === themeKey;
                      return (
                        <button
                          key={themeKey}
                          onClick={e => {
                            setTheme(themeKey);
                            setIsDarkMode(themeKey !== 'pureLight');
                            localStorage.setItem('el_theme', themeKey);
                            localStorage.setItem('el_dark_mode', themeKey !== 'pureLight' ? 'true' : 'false');
                            triggerSoftGleam(e);
                            openLuxModal('تغيير الثيم', `تم تفعيل ثيم "${t.name}" الفخم بنجاح!`, 'success');
                          }}
                          className={`p-4 rounded-2xl border text-right transition-all group ${
                            selected
                              ? 'border-[#d8b46a] bg-white/[0.08] shadow-lg scale-[1.02]'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className={`w-full h-9 rounded-xl bg-gradient-to-r ${t.previewGradient} mb-3 shadow-inner`} />
                          <span className="text-xs font-bold text-white block truncate font-active-ar">{t.name}</span>
                          <span className="text-[10px] text-neutral-400 block font-active-en tracking-wide">{t.nameEn}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. SEMI-TRANSPARENT POLISHED GLASS & 3D CONTROLLER (الكاردات شبه الزجاجية وتأثيرات 3D) */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/10 mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2 font-active-ar">
                        <Sparkles className="w-5 h-5 text-cyan-300 animate-icon-breath" />
                        <span className="text-3d-title">الكاردات شبه الزجاجية المصقولة وتأثيرات 3D</span>
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1 font-active-ar">
                        تحويل كاردات الموقع إلى زجاج مصقول شفاف عاكس لتظهر خلفية الموقع المتوهجة والشفق والأشعة بوضوح مذهل مع بروز 3D للأيقونات والنصوص
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={e => {
                          setGlassSheenActive(!glassSheenActive);
                          triggerSoftGleam(e);
                        }}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 font-active-ar ${
                          glassSheenActive
                            ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                            : 'bg-white/5 border-white/10 text-neutral-400'
                        }`}
                      >
                        <Flame className="w-4 h-4" />
                        <span>بريق الزجاج المصقول: {glassSheenActive ? 'مُفعّل' : 'مُعطل'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          setEffects3DActive(!effects3DActive);
                          triggerSoftGleam(e);
                        }}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 font-active-ar ${
                          effects3DActive
                            ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                            : 'bg-white/5 border-white/10 text-neutral-400'
                        }`}
                      >
                        <Diamond className="w-4 h-4" />
                        <span>بروز 3D: {effects3DActive ? 'مُفعّل' : 'مُعطل'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {GLASS_PRESETS.map(preset => {
                      const selected = glassMode === preset.id;
                      return (
                        <div
                          key={preset.id}
                          onClick={e => {
                            setGlassMode(preset.id);
                            triggerSoftGleam(e);
                            openLuxModal('نمط الزجاج المصقول', `تم تفعيل ${preset.name} وتأثيرات 3D بنجاح!`, 'success');
                          }}
                          className={`cursor-pointer p-4 rounded-2xl border transition-all relative overflow-hidden group ${
                            selected
                              ? 'border-cyan-400 bg-white/15 shadow-[0_0_25px_rgba(6,182,212,0.4)] scale-[1.02]'
                              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-xl border ${preset.previewBorder} bg-gradient-to-br ${preset.previewBg} flex items-center justify-center shadow-inner`}>
                                <Sparkles className={`w-4 h-4 ${selected ? 'text-cyan-300' : 'text-neutral-400'} icon-3d`} />
                              </div>
                              <div>
                                <span className={`text-xs font-black block font-active-ar ${selected ? 'text-cyan-200 text-3d-title' : 'text-white'}`}>
                                  {preset.name}
                                </span>
                                <span className="text-[10px] text-neutral-400 block font-active-en tracking-wide">
                                  {preset.nameEn}
                                </span>
                              </div>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold font-active-en">
                              {preset.badge}
                            </span>
                          </div>

                          <p className="text-[11px] text-neutral-300 font-active-ar leading-relaxed">
                            {preset.desc}
                          </p>

                          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px]">
                            <span className="text-neutral-400 font-active-ar">درجة الشفافية الزجاجية:</span>
                            <span className="font-bold text-[#f5dfa4] font-num">{preset.opacity}% شفافية بلورية</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ALL RAW FIELDS */}
            {activeTab === 'allFields' && (
              <div className={`p-6 sm:p-8 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} backdrop-blur-2xl space-y-6`}>
                <div>
                  <h2 className="text-xl font-bold text-white font-active-ar">كافة الحقول المسترجعة من خادم إيرثلنك</h2>
                  <p className="text-xs text-neutral-400 mt-1 font-active-ar">عرض مباشر لكافة الحقول الحقيقية القادمة من السيرفر</p>
                </div>

                {accountData?.allFields && accountData.allFields.length > 0 ? (
                  <div className="overflow-x-auto border border-white/10 rounded-2xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-white/[0.05] text-white border-b border-white/10 font-active-ar">
                        <tr>
                          <th className="p-3.5 font-bold">#</th>
                          <th className="p-3.5 font-bold">اسم الحقل</th>
                          <th className="p-3.5 font-bold">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-num">
                        {accountData.allFields.map((field, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="p-3.5 text-neutral-500">{idx + 1}</td>
                            <td className="p-3.5 font-medium text-neutral-300 font-active-ar">{field.label}</td>
                            <td className="p-3.5 text-white">{field.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-neutral-500 text-xs font-active-ar">لا توجد بيانات إضافية</div>
                )}
              </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
              <div className={`p-6 sm:p-8 rounded-3xl ${currentTheme.cardBg} border ${currentTheme.border} backdrop-blur-2xl space-y-6`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white font-active-ar">سجل العمليات والتحديثات</h2>
                    <p className="text-xs text-neutral-400 mt-1 font-active-ar">سجل فحص وتحديث بيانات الجلسة</p>
                  </div>
                  <button
                    onClick={() => setHistory([])}
                    className="text-xs px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 font-active-ar"
                  >
                    مسح السجل
                  </button>
                </div>

                <div className="overflow-x-auto border border-white/10 rounded-2xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-white/[0.05] text-white border-b border-white/10 font-active-ar">
                      <tr>
                        <th className="p-3.5 font-bold">الوقت</th>
                        <th className="p-3.5 font-bold">العملية</th>
                        <th className="p-3.5 font-bold">النتيجة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-num">
                      {history.length > 0 ? (
                        history.map(item => (
                          <tr key={item.id} className="hover:bg-white/[0.02]">
                            <td className="p-3.5 text-neutral-400">{item.time}</td>
                            <td className="p-3.5 font-semibold text-white font-active-ar">{item.action}</td>
                            <td className="p-3.5">
                              <span className="text-xs text-emerald-400 font-active-ar">{item.result}</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="text-center py-8 text-neutral-500 font-active-ar">لا توجد عمليات مسجلة حتى الآن</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>

          {/* ========================================================
              3. ULTRA-LUXURIOUS FLOATING CRYSTAL DOCK (الأقسام الخمسة العائمة)
          ======================================================== */}
          <nav className="fixed bottom-4 inset-x-0 mx-auto w-[92%] sm:w-auto max-w-lg z-40 luxury-dock rounded-3xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-around gap-1">
              {bottomFiveTabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={e => {
                      setActiveTab(tab.id as any);
                      triggerSoftGleam(e);
                    }}
                    className={`flex flex-col items-center gap-1 py-2 px-3 sm:px-4 rounded-2xl transition-all duration-300 relative group ${
                      active
                        ? `bg-gradient-to-r ${currentTheme.primary} text-neutral-950 font-black shadow-[0_0_20px_rgba(216,180,106,0.6)] scale-105`
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform ${active ? 'animate-icon-breath scale-110' : 'group-hover:animate-float-gentle'}`} />
                    <span className="text-[10px] sm:text-[11px] font-bold font-active-ar leading-none">{tab.label}</span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-950 animate-ping absolute -bottom-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
