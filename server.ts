import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Earthlink API constants matching user's Python script
const EARTHLINK_BASE = 'https://ubapi.earthlink.iq';
const TOKEN_URL = `${EARTHLINK_BASE}/api/user/Token`;
const SESSION_URL = `${EARTHLINK_BASE}/api/user/CheckSession`;
const DATA_URL = `${EARTHLINK_BASE}/api/user/GetUserDataAr`;
const TIMEOUT_MS = 30000;

const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://user.earthlink.iq',
  'Referer': 'https://user.earthlink.iq/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// In-memory session store
interface UserSession {
  token: string;
  username: string;
  loginTime: number;
  lastAccountData?: any;
}

const sessions = new Map<string, UserSession>();

// Persistent configuration file for Alert & Automation (even if browser is closed)
const CONFIG_FILE = path.join(__dirname, 'alert-config.json');

export interface AlertConfig {
  webhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  channel: 'telegram' | 'webhook' | 'both';
  day: number; // day of month 1-31
  hour: number; // 1-12
  minute: number; // 0-59
  second: number; // 0-59
  period: 'AM' | 'PM';
  enabled: boolean;
  notifyOnDaysRemaining: number;
  lastSentTimestamp?: string;
  cachedUsername?: string;
  cachedPassword?: string;
}

const DEFAULT_WEBHOOK_URL = 'https://discord.com/api/webhooks/1555280750654398528/m7pjebcPl7DL95_KdyoEDcHspnG9Rk3mOfITsMhMJcgtGfave55W_LQQZ6pk0nDEfcIt';
const DEFAULT_TG_TOKEN = '8873866209:AAExp-CQKB8-6WDARWcotQKm8HUEpIomeKM';
const DEFAULT_TG_CHAT_ID = '910624538';

function loadAlertConfig(): AlertConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        webhookUrl: parsed.webhookUrl || DEFAULT_WEBHOOK_URL,
        telegramBotToken: parsed.telegramBotToken || DEFAULT_TG_TOKEN,
        telegramChatId: parsed.telegramChatId || DEFAULT_TG_CHAT_ID,
      };
    }
  } catch (e) {
    console.error('Error reading alert-config.json:', e);
  }
  return {
    webhookUrl: DEFAULT_WEBHOOK_URL,
    telegramBotToken: DEFAULT_TG_TOKEN,
    telegramChatId: DEFAULT_TG_CHAT_ID,
    channel: 'both',
    day: 1,
    hour: 9,
    minute: 0,
    second: 0,
    period: 'AM',
    enabled: true,
    notifyOnDaysRemaining: 3,
  };
}

function saveAlertConfig(cfg: AlertConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving alert-config.json:', e);
  }
}

let activeAlertConfig = loadAlertConfig();

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// 1. POST /api/login -> authenticate with Earthlink Token URL
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'يجب إدخال اسم المستخدم وكلمة المرور' });
    }

    const trimmedUsername = String(username).trim();
    const cleanPassword = String(password);

    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'password');
    bodyParams.append('username', trimmedUsername);
    bodyParams.append('password', cleanPassword);
    bodyParams.append('Logintype', '0');

    let tokenResponse;
    try {
      tokenResponse = await fetchWithTimeout(TOKEN_URL, {
        method: 'POST',
        headers: {
          ...DEFAULT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });
    } catch (netErr: any) {
      console.error('Network error reaching Earthlink token URL:', netErr);
      return res.status(502).json({
        error: `تعذر الاتصال بخادم إيرثلنك (${TOKEN_URL}): ${netErr?.message || 'خطأ في الشبكة'}`,
      });
    }

    const responseText = await tokenResponse.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: `استجابة غير صالحة من إيرثلنك (HTTP ${tokenResponse.status}): ${responseText.slice(0, 200)}`,
      });
    }

    if (!tokenResponse.ok) {
      const reason =
        data?.error_description ||
        data?.message ||
        data?.error ||
        `خطأ HTTP ${tokenResponse.status}`;
      return res.status(tokenResponse.status >= 400 && tokenResponse.status < 500 ? 401 : 502).json({
        error: `فشل تسجيل الدخول: ${reason}`,
      });
    }

    const token = data?.access_token || data?.accessToken || data?.token;
    if (!token) {
      return res.status(502).json({
        error: 'لم يرجع خادم إيرثلنك رمز الدخول (Token). راجع صحة البيانات المدخلة.',
      });
    }

    const authHeaders = {
      ...DEFAULT_HEADERS,
      'Authorization': `Bearer ${token}`,
    };

    // Check session
    try {
      const sessionRes = await fetchWithTimeout(SESSION_URL, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (sessionRes.status === 401 || sessionRes.status === 403) {
        return res.status(401).json({ error: 'الجلسة مرفوضة أو انتهت صلاحيتها في خادم إيرثلنك.' });
      }
    } catch (sErr) {
      console.warn('Session check warning:', sErr);
    }

    // Fetch user data
    let accountData: any = null;
    try {
      const dataRes = await fetchWithTimeout(DATA_URL, {
        method: 'GET',
        headers: authHeaders,
      });
      if (dataRes.ok) {
        accountData = await dataRes.json();
      }
    } catch (dErr) {
      console.warn('Initial account fetch warning:', dErr);
    }

    const sessionId = generateId();
    sessions.set(sessionId, {
      token: String(token),
      username: trimmedUsername,
      loginTime: Date.now(),
      lastAccountData: accountData,
    });

    // Cache username in alert config for recurring background alerts
    activeAlertConfig.cachedUsername = trimmedUsername;
    activeAlertConfig.cachedPassword = cleanPassword;
    saveAlertConfig(activeAlertConfig);

    res.cookie('el_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      authenticated: true,
      sessionId,
      username: trimmedUsername,
      token: String(token),
      data: accountData,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: `حدث خطأ داخلي: ${err?.message || 'غير معروف'}` });
  }
});

// Helper to get active session
function getSession(req: express.Request): UserSession | null {
  const sessionId = req.cookies?.el_session || req.headers['x-session-id'];
  if (sessionId && sessions.has(String(sessionId))) {
    return sessions.get(String(sessionId))!;
  }
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const rawToken = auth.replace('Bearer ', '').trim();
    for (const s of sessions.values()) {
      if (s.token === rawToken) return s;
    }
    return {
      token: rawToken,
      username: 'المشترك',
      loginTime: Date.now(),
    };
  }
  // If we have an active session in memory, return the most recent one
  const all = Array.from(sessions.values());
  if (all.length > 0) {
    return all[all.length - 1];
  }
  return null;
}

// 2. GET /api/me -> returns live user account data from Earthlink
app.get('/api/me', async (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ authenticated: false, message: 'غير مسجل الدخول' });
  }

  const token = session.token;
  const authHeaders = {
    ...DEFAULT_HEADERS,
    'Authorization': `Bearer ${token}`,
  };

  try {
    const sessionRes = await fetchWithTimeout(SESSION_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (sessionRes.status === 401 || sessionRes.status === 403) {
      return res.status(401).json({
        authenticated: false,
        error: 'انتهت صلاحية الجلسة لدى إيرثلنك، يرجى تسجيل الدخول مجدداً.',
      });
    }

    const dataRes = await fetchWithTimeout(DATA_URL, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!dataRes.ok) {
      return res.status(dataRes.status).json({
        error: `فشل جلب بيانات الحساب من خادم إيرثلنك (HTTP ${dataRes.status})`,
      });
    }

    const rawData = await dataRes.json();
    session.lastAccountData = rawData;

    return res.json({
      authenticated: true,
      username: session.username,
      data: rawData,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Fetch account error:', err);
    if (session.lastAccountData) {
      return res.json({
        authenticated: true,
        username: session.username,
        data: session.lastAccountData,
        cached: true,
        warning: `تعذر الاتصال المباشر حالياً (${err?.message})، تم عرض آخر بيانات محفوظة.`,
        timestamp: new Date().toISOString(),
      });
    }
    return res.status(502).json({
      error: `تعذر الاتصال المباشر بخادم إيرثلنك: ${err?.message || 'خطأ اتصال'}`,
    });
  }
});

// 3. Notification dispatch logic (Telegram & Webhook with subscription image)
export async function sendNotificationMessage(
  accountInfo: any,
  config: AlertConfig,
  triggerType: 'manual' | 'scheduled' = 'manual'
): Promise<{ success: boolean; details: string }> {
  const username = accountInfo?.username || config.cachedUsername || 'المشترك';
  const plan = accountInfo?.plan || accountInfo?.packageName || '—';
  const expiry = accountInfo?.expiry || accountInfo?.expiryDate || '—';
  const daysLeft = accountInfo?.daysLeft ?? '—';
  const price = accountInfo?.price ? `${accountInfo.price} د.ع` : '—';
  const status = accountInfo?.serviceStatus || accountInfo?.accountStatus || 'Online';
  const ip = accountInfo?.ip || '—';
  const agent = accountInfo?.agentName || '—';
  const image = accountInfo?.image || '';

  const nowFormatted = new Date().toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });

  // Styled Telegram Markdown text
  const telegramText = `
🛰 *تنبيه اشتراك EARTHLINK PRO*
━━━━━━━━━━━━━━━━━━━━━
👤 *المشترك:* \`${username}\`
📦 *نوع الباقة:* *${plan}*
⏳ *الأيام المتبقية:* *${daysLeft} يوم*
📅 *تاريخ الانتهاء:* \`${expiry}\`
💰 *سعر الاشتراك:* ${price}
📡 *حالة الاتصال:* ${status}
🌐 *عنوان IP:* \`${ip}\`
🏢 *الوكيل:* ${agent}
⏰ *وقت الإشعار:* ${nowFormatted}
📌 *النوع:* ${triggerType === 'scheduled' ? 'تنبيه مجدول تلقائي ⏰' : 'إرسال فوري مباشر ⚡'}
━━━━━━━━━━━━━━━━━━━━━
_تم الإرسال تلقائياً عبر Subscriber Command Center_
`.trim();

  const results: string[] = [];
  let atLeastOneSuccess = false;

  // 1. Send via Telegram Bot API
  if ((config.channel === 'telegram' || config.channel === 'both') && config.telegramBotToken && config.telegramChatId) {
    try {
      const botToken = config.telegramBotToken.trim();
      const chatId = config.telegramChatId.trim();

      // If subscription image exists, send as photo with caption; otherwise send as text message
      if (image && typeof image === 'string' && image.startsWith('http')) {
        const photoUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        const photoRes = await fetch(photoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: image,
            caption: telegramText,
            parse_mode: 'Markdown',
          }),
        });
        const photoJson: any = await photoRes.json();
        if (photoJson.ok) {
          atLeastOneSuccess = true;
          results.push('تم إرسال الصورة والبيانات إلى Telegram بنجاح');
        } else {
          // fallback to text message
          const msgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const msgRes = await fetch(msgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: telegramText,
              parse_mode: 'Markdown',
            }),
          });
          const msgJson: any = await msgRes.json();
          if (msgJson.ok) {
            atLeastOneSuccess = true;
            results.push('تم إرسال الرسالة إلى Telegram بنجاح');
          } else {
            results.push(`فشل Telegram: ${msgJson.description || 'خطأ في الإرسال'}`);
          }
        }
      } else {
        const msgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const msgRes = await fetch(msgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: telegramText,
            parse_mode: 'Markdown',
          }),
        });
        const msgJson: any = await msgRes.json();
        if (msgJson.ok) {
          atLeastOneSuccess = true;
          results.push('تم إرسال الرسالة إلى Telegram بنجاح');
        } else {
          results.push(`فشل Telegram: ${msgJson.description || 'خطأ في التوكن أو المعرف'}`);
        }
      }
    } catch (tgErr: any) {
      results.push(`خطأ اتصال Telegram: ${tgErr?.message}`);
    }
  }

  // 2. Send via Webhook URL (Discord / Slack / Custom API)
  if ((config.channel === 'webhook' || config.channel === 'both') && config.webhookUrl) {
    try {
      const webhookUrl = config.webhookUrl.trim();
      const isDiscord = webhookUrl.includes('discord.com');
      const isSlack = webhookUrl.includes('slack.com');

      let payload: any = {
        title: 'EARTHLINK PRO - إشعار بيانات الاشتراك',
        username,
        plan,
        daysLeft,
        expiry,
        price,
        status,
        ip,
        agent,
        image,
        timestamp: new Date().toISOString(),
        triggerType,
      };

      if (isDiscord) {
        payload = {
          username: 'Earthlink Pro Bot',
          avatar_url: image || 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/satellite.svg',
          content: `🛰 **تنبيه اشتراك إيرثلنك للمشترك:** \`${username}\``,
          embeds: [
            {
              title: `بيانات اشتراك إيرثلنك | ${plan}`,
              description: `الأيام المتبقية: **${daysLeft} يوم**\nتاريخ الانتهاء: \`${expiry}\`\nالسعر: ${price}\nالحالة: **${status}**\nIP: \`${ip}\``,
              color: 0xd8b46a,
              image: image ? { url: image } : undefined,
              footer: { text: `Earthlink Pro · ${nowFormatted}` },
            },
          ],
        };
      } else if (isSlack) {
        payload = {
          text: `🛰 *تنبيه اشتراك إيرثلنك للمشترك: ${username}*\nالباقة: *${plan}* | الأيام المتبقية: *${daysLeft} يوم* | الانتهاء: *${expiry}*`,
        };
      }

      const whRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (whRes.ok) {
        atLeastOneSuccess = true;
        results.push('تم إرسال الإشعار إلى رابط Webhook بنجاح');
      } else {
        const errorText = await whRes.text();
        results.push(`فشل Webhook (HTTP ${whRes.status}): ${errorText.slice(0, 100)}`);
      }
    } catch (whErr: any) {
      results.push(`خطأ اتصال Webhook: ${whErr?.message}`);
    }
  }

  return {
    success: atLeastOneSuccess,
    details: results.join(' | ') || 'لم يتم تحديد أي قناة اتصال مفعلة',
  };
}

// 4. GET /api/alerts/config -> Get current alert settings
app.get('/api/alerts/config', (req, res) => {
  res.json(activeAlertConfig);
});

// 5. POST /api/alerts/config -> Save alert settings
app.post('/api/alerts/config', (req, res) => {
  const body = req.body || {};
  activeAlertConfig = {
    ...activeAlertConfig,
    webhookUrl: body.webhookUrl !== undefined ? String(body.webhookUrl) : activeAlertConfig.webhookUrl,
    telegramBotToken: body.telegramBotToken !== undefined ? String(body.telegramBotToken) : activeAlertConfig.telegramBotToken,
    telegramChatId: body.telegramChatId !== undefined ? String(body.telegramChatId) : activeAlertConfig.telegramChatId,
    channel: body.channel || activeAlertConfig.channel,
    day: Number(body.day) || activeAlertConfig.day,
    hour: Number(body.hour) || activeAlertConfig.hour,
    minute: Number(body.minute) || activeAlertConfig.minute,
    second: Number(body.second) || activeAlertConfig.second,
    period: body.period === 'PM' ? 'PM' : 'AM',
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : activeAlertConfig.enabled,
    notifyOnDaysRemaining: Number(body.notifyOnDaysRemaining) || activeAlertConfig.notifyOnDaysRemaining,
  };
  saveAlertConfig(activeAlertConfig);
  res.json({ success: true, config: activeAlertConfig });
});

// 6. POST /api/alerts/trigger -> Send instant notification now
app.post('/api/alerts/trigger', async (req, res) => {
  try {
    const session = getSession(req);
    const accountData = req.body?.accountData || session?.lastAccountData || {};
    const result = await sendNotificationMessage(accountData, activeAlertConfig, 'manual');
    activeAlertConfig.lastSentTimestamp = new Date().toISOString();
    saveAlertConfig(activeAlertConfig);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'خطأ في إرسال التنبيه' });
  }
});

// 7. POST /api/contact -> Send message to Developer Discord Webhook
const DEVELOPER_DISCORD_WEBHOOK = DEFAULT_WEBHOOK_URL;

app.post('/api/contact', async (req, res) => {
  try {
    const { name, message, username, accountData } = req.body;
    if (!name || !message) {
      return res.status(400).json({ error: 'يرجى إدخال الاسم والرسالة' });
    }

    const nowFormatted = new Date().toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
    const user = username || accountData?.username || 'مشترك إيرثلنك';
    const plan = accountData?.plan || '—';
    const daysLeft = accountData?.daysLeft || '—';
    const ip = accountData?.ip || '—';

    const payload = {
      username: 'Earthlink Pro · دعم المبرمج',
      avatar_url: 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/satellite.svg',
      content: `📬 **رسالة جديدة من مشترك Earthlink Pro إلى المبرمج**`,
      embeds: [
        {
          title: `رسالة دعم من: ${name}`,
          description: `💬 **نص الرسالة:**\n\`\`\`\n${message}\n\`\`\``,
          color: 0xd8b46a,
          fields: [
            { name: '👤 اسم المستخدم', value: `\`${user}\``, inline: true },
            { name: '📦 الباقة', value: `${plan}`, inline: true },
            { name: '⏳ الأيام المتبقية', value: `${daysLeft} يوم`, inline: true },
            { name: '🌐 عنوان IP', value: `\`${ip}\``, inline: true },
            { name: '📅 تاريخ ووقت الإرسال', value: `${nowFormatted}`, inline: true },
          ],
          footer: { text: 'Earthlink Pro Developer Dispatcher' },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const webhookRes = await fetch(DEVELOPER_DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (webhookRes.ok) {
      return res.json({ success: true, message: 'تم إرسال رسالتك إلى المبرمج بنجاح! شكراً لتواصلك.' });
    } else {
      const errTxt = await webhookRes.text();
      return res.status(502).json({ error: `فشل الإرسال إلى خادم Discord: ${errTxt.slice(0, 100)}` });
    }
  } catch (err: any) {
    console.error('Contact dev error:', err);
    return res.status(500).json({ error: `حدث خطأ: ${err?.message || 'تعذر الإرسال'}` });
  }
});

// 8. GET /api/alerts/workflow-yml -> Generates the GitHub Actions .yml workflow file
app.get('/api/alerts/workflow-yml', (req, res) => {
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // Convert 12h AM/PM to 24h UTC for cron
  let hour24 = activeAlertConfig.hour % 12;
  if (activeAlertConfig.period === 'PM') hour24 += 12;

  // Baghdad is UTC+3 (Iraq Standard Time). Subtract 3 hours (mod 24) for GitHub Actions UTC cron
  let utcHour = (hour24 - 3 + 24) % 24;

  const ymlContent = `# ========================================================
# EARTHLINK PRO - AUTOMATIC SUBSCRIBER NOTIFICATION WORKFLOW
# هذا الملف يعمل على خوادم GitHub Actions حتى لو أغلقت الموقع أو المتصفح
# يتم تشغيله في الموعد المحدد تلقائياً باليوم والساعة والدقيقة
# ========================================================

name: Earthlink Pro Automated Subscription Alert

on:
  schedule:
    # يعمل تلقائياً حسب الوقت المحدد:
    # اليوم: ${activeAlertConfig.day} من كل شهر | الساعة: ${activeAlertConfig.hour}:${String(activeAlertConfig.minute).padStart(2, '0')}:${String(activeAlertConfig.second).padStart(2, '0')} ${activeAlertConfig.period} بتوقيت بغداد (العراق)
    # السنة الحالية: ${currentYear} | الشهر الحالي: ${currentMonth}
    - cron: '${activeAlertConfig.minute} ${utcHour} ${activeAlertConfig.day} * *'
  workflow_dispatch: # يتيح لك أيضاً تشغيل التنبيه يدوياً من GitHub بنقرة زر واحدة

jobs:
  check-and-alert:
    name: Check Earthlink Subscription & Dispatch Alert
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Execute Notification Runner
        env:
          APP_URL: "\${{ secrets.APP_URL }}"
          EARTHLINK_USERNAME: "\${{ secrets.EARTHLINK_USERNAME || '${activeAlertConfig.cachedUsername || 's.jafar116'}' }}"
          EARTHLINK_PASSWORD: "\${{ secrets.EARTHLINK_PASSWORD || '${activeAlertConfig.cachedPassword || '123'}' }}"
          TELEGRAM_BOT_TOKEN: "\${{ secrets.TELEGRAM_BOT_TOKEN || '${activeAlertConfig.telegramBotToken || '8873866209:AAExp-CQKB8-6WDARWcotQKm8HUEpIomeKM'}' }}"
          TELEGRAM_CHAT_ID: "\${{ secrets.TELEGRAM_CHAT_ID || '${activeAlertConfig.telegramChatId || '910624538'}' }}"
          WEBHOOK_URL: "\${{ secrets.WEBHOOK_URL || '${activeAlertConfig.webhookUrl || 'https://discord.com/api/webhooks/1555280750654398528/m7pjebcPl7DL95_KdyoEDcHspnG9Rk3mOfITsMhMJcgtGfave55W_LQQZ6pk0nDEfcIt'}' }}"
          NOTIFICATION_CHANNEL: "${activeAlertConfig.channel || 'both'}"
        run: |
          node -e "
          console.log('تشغيل فحص اشتراك إيرثلنك التلقائي عبر خوادم GitHub Actions...');
          const tokenUrl = 'https://ubapi.earthlink.iq/api/user/Token';
          const dataUrl = 'https://ubapi.earthlink.iq/api/user/GetUserDataAr';
          const username = process.env.EARTHLINK_USERNAME;
          const password = process.env.EARTHLINK_PASSWORD;
          const tgToken = process.env.TELEGRAM_BOT_TOKEN;
          const tgChat = process.env.TELEGRAM_CHAT_ID;
          const webhookUrl = process.env.WEBHOOK_URL;
          const channel = process.env.NOTIFICATION_CHANNEL || 'both';

          if (!username || !password) {
            console.error('يرجى التحقق من اسم المستخدم وكلمة المرور');
            process.exit(1);
          }

          async function run() {
            try {
              const body = new URLSearchParams({
                grant_type: 'password',
                username: username,
                password: password,
                Logintype: '0'
              }).toString();

              const tokenRes = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Origin': 'https://user.earthlink.iq',
                  'User-Agent': 'Mozilla/5.0'
                },
                body: body
              });

              const tokenJson = await tokenRes.json();
              const token = tokenJson.access_token || tokenJson.token;
              if (!token) throw new Error('فشل استخراج رمز الدخول: ' + JSON.stringify(tokenJson));

              const userRes = await fetch(dataUrl, {
                headers: {
                  'Authorization': 'Bearer ' + token,
                  'Origin': 'https://user.earthlink.iq',
                  'User-Agent': 'Mozilla/5.0'
                }
              });

              const raw = await userRes.json();
              const d = raw.data || raw.result || raw.userData || raw;
              const plan = d.subscriptionType || d.accountName || d.packageName || 'باقة إيرثلنك PLUS';
              const days = d.activeDaysLeft || d.daysLeft || d.remainingDays || '—';
              const expiry = d.expiryDate || d.expireDate || '—';
              const ip = d.ip || d.ipAddress || '—';
              const price = d.accountPrice || d.price || '—';
              const image = d.image || d.imageUrl || '';
              const status = d.serviceStatus || d.status || 'فعال ومستقر';
              const nowFormatted = new Date().toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });

              const msg = '👑 *تنبيه اشتراك EARTHLINK PRO الملكي التلقائي*\\n' +
                          '━━━━━━━━━━━━━━━━━━━━━\\n' +
                          '👤 *المشترك:* \`' + username + '\`\\n' +
                          '📦 *نوع الباقة:* *' + plan + '*\\n' +
                          '⏳ *الأيام المتبقية:* *' + days + ' يوم*\\n' +
                          '📅 *تاريخ الانتهاء:* \`' + expiry + '\`\\n' +
                          '💰 *سعر التجديد:* ' + price + ' د.ع\\n' +
                          '⚡ *حالة الخدمة:* *' + status + '*\\n' +
                          '🌐 *عنوان IP:* \`' + ip + '\`\\n' +
                          '━━━━━━━━━━━━━━━━━━━━━\\n' +
                          '⏰ *الوقت المباشر:* ' + nowFormatted;

              // 1. Send to Telegram
              if ((channel === 'telegram' || channel === 'both') && tgToken && tgChat) {
                if (image && image.startsWith('http')) {
                  await fetch('https://api.telegram.org/bot' + tgToken + '/sendPhoto', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({chat_id: tgChat, photo: image, caption: msg, parse_mode: 'Markdown'})
                  });
                } else {
                  await fetch('https://api.telegram.org/bot' + tgToken + '/sendMessage', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({chat_id: tgChat, text: msg, parse_mode: 'Markdown'})
                  });
                }
                console.log('✅ تم الإرسال إلى Telegram بنجاح!');
              }

              // 2. Send to Discord Webhook
              if ((channel === 'webhook' || channel === 'both') && webhookUrl) {
                await fetch(webhookUrl, {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({
                    username: 'Earthlink Pro · التنبيه التلقائي',
                    avatar_url: image || 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/satellite.svg',
                    content: '🛰 **تنبيه اشتراك إيرثلنك التلقائي الملكي للمشترك: \`' + username + '\`**',
                    embeds: [{
                      title: '👑 بيانات باقة إيرثلنك المعتمدة | ' + plan,
                      description: '⏳ الأيام المتبقية: **' + days + ' يوم**\\n📅 تاريخ الانتهاء: \`' + expiry + '\`\\n💰 سعر الاشتراك: **' + price + ' د.ع**\\n⚡ حالة الخدمة: **' + status + '**\\n🌐 عنوان IP: \`' + ip + '\`',
                      color: 0xd8b46a,
                      image: image ? { url: image } : undefined,
                      footer: { text: 'Earthlink Pro Automated Workflow · ' + nowFormatted }
                    }]
                  })
                });
                console.log('✅ تم الإرسال إلى Discord Webhook بنجاح!');
              }
            } catch (err) {
              console.error('خطأ أثناء تشغيل الفحص:', err);
              process.exit(1);
            }
          }
          run();
          "
`;

  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="earthlink-alert.yml"');
  res.send(ymlContent);
});

// Periodic server-side scheduled check (every 30 seconds)
setInterval(async () => {
  if (!activeAlertConfig.enabled) return;

  const now = new Date();
  // Target Baghdad time zone UTC+3
  const baghdadHours = (now.getUTCHours() + 3) % 24;
  const baghdadMinutes = now.getUTCMinutes();
  const baghdadDay = now.getUTCDate();

  let targetHour24 = activeAlertConfig.hour % 12;
  if (activeAlertConfig.period === 'PM') targetHour24 += 12;

  // Check if today is the target day and the hour & minute match
  if (
    baghdadDay === activeAlertConfig.day &&
    baghdadHours === targetHour24 &&
    baghdadMinutes === activeAlertConfig.minute
  ) {
    // Check if we already sent an alert in this hour to prevent duplicate triggers
    const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${baghdadDay}-${targetHour24}`;
    if (activeAlertConfig.lastSentTimestamp && activeAlertConfig.lastSentTimestamp.startsWith(todayKey)) {
      return;
    }

    console.log('Triggering automated scheduled alert...');
    // Grab cached session or user data
    const sessionsArr = Array.from(sessions.values());
    const latestSession = sessionsArr[sessionsArr.length - 1];
    const accountData = latestSession?.lastAccountData || {};

    await sendNotificationMessage(accountData, activeAlertConfig, 'scheduled');
    activeAlertConfig.lastSentTimestamp = `${todayKey}T${baghdadMinutes}`;
    saveAlertConfig(activeAlertConfig);
  }
}, 30000);

// 8. POST /api/logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.cookies?.el_session || req.headers['x-session-id'];
  if (sessionId) {
    sessions.delete(String(sessionId));
  }
  res.clearCookie('el_session');
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

// 9. Status / health check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    earthlinkBase: EARTHLINK_BASE,
    time: new Date().toISOString(),
  });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
