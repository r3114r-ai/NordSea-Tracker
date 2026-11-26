// MVP B2B-платформы «NordSea Export»: публичный сайт EN/RU + канбан-трекер оптовых запросов.
// Стек: Node.js + Express, хранение в JSON. Структура с заделом на масштабирование:
// маршруты REST, отдельные модули хранилища и авторизации.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./lib/store');
const auth = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const STAGES = ['new', 'dialogue', 'negotiation', 'deal', 'rejected'];

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- служебные middleware ----------
function currentUser(req) {
  const cookies = auth.parseCookies(req.headers.cookie);
  return auth.verify(cookies.ns_session);
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });
  req.user = user;
  next();
}

// ---------- каталог ----------
app.get('/api/products', (req, res) => {
  res.json(store.readJSON('products.json', { categories: [], products: [] }));
});

// Добавление продукта — только админ
app.post('/api/products', requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = { en: String(b.name?.en || '').trim().slice(0, 120), ru: String(b.name?.ru || '').trim().slice(0, 120) };
  if (!name.en && !name.ru) return res.status(400).json({ error: 'Укажите название продукта' });
  const str = (v, max) => String(v || '').trim().slice(0, max);
  const product = {
    id: 'p-' + Date.now().toString(36),
    categoryId: str(b.categoryId, 60) || 'frozen-fish',
    icon: str(b.icon, 8) || '🐟',
    visible: true,
    name,
    latin: str(b.latin, 80),
    specs: { en: str(b.specs?.en, 200), ru: str(b.specs?.ru, 200) },
    pack: { en: str(b.pack?.en, 120), ru: str(b.pack?.ru, 120) },
    moq: { en: str(b.moq?.en, 120), ru: str(b.moq?.ru, 120) },
    season: { en: str(b.season?.en, 120), ru: str(b.season?.ru, 120) },
  };
  const data = store.readJSON('products.json', { categories: [], products: [] });
  data.products.push(product);
  store.writeJSON('products.json', data);
  res.json({ ok: true, product });
});

// Редактирование/скрытие продукта — только админ
app.patch('/api/products/:id', requireAdmin, (req, res) => {
  const data = store.readJSON('products.json', { categories: [], products: [] });
  const p = data.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Продукт не найден' });
  const b = req.body || {};
  if (typeof b.visible === 'boolean') p.visible = b.visible;
  const str = (v, max) => String(v || '').trim().slice(0, max);
  if (b.name) {
    p.name.en = str(b.name.en, 120) || p.name.en;
    p.name.ru = str(b.name.ru, 120) || p.name.ru;
  }
  if (b.specs) { p.specs.en = str(b.specs.en, 200); p.specs.ru = str(b.specs.ru, 200); }
  if (b.moq) { p.moq.en = str(b.moq.en, 120); p.moq.ru = str(b.moq.ru, 120); }
  if (b.pack) { p.pack.en = str(b.pack.en, 120); p.pack.ru = str(b.pack.ru, 120); }
  store.writeJSON('products.json', data);
  res.json({ ok: true, product: p });
});

// ---------- заявки ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELD_LIMITS = { company: 120, country: 80, contactName: 120, email: 120, phone: 60, product: 300, volume: 120, message: 2000 };
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// лёгкая защита от спама: не более 10 запросов с одного IP за 10 минут
const ipHits = new Map();
function rateLimited(req) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > 10;
}

app.post('/api/inquiries', (req, res) => {
  if (rateLimited(req)) return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
  const b = req.body || {};
  const now = new Date().toISOString();
  const inquiry = {
    id: crypto.randomUUID(),
    createdAt: now,
    stage: 'new',
    assignee: null,
    company: clean(b.company, FIELD_LIMITS.company),
    country: clean(b.country, FIELD_LIMITS.country),
    contactName: clean(b.contactName, FIELD_LIMITS.contactName),
    email: clean(b.email, FIELD_LIMITS.email),
    phone: clean(b.phone, FIELD_LIMITS.phone),
    product: clean(b.product, FIELD_LIMITS.product),
    volume: clean(b.volume, FIELD_LIMITS.volume),
    message: clean(b.message, FIELD_LIMITS.message),
    lang: clean(b.lang, 2) === 'ru' ? 'ru' : 'en',
    comments: [],
    history: [{ at: now, from: null, to: 'new', by: 'форма на сайте' }],
  };
  const missing = [];
  if (!inquiry.company) missing.push('company');
  if (!inquiry.country) missing.push('country');
  if (!inquiry.contactName) missing.push('contactName');
  if (!inquiry.email || !EMAIL_RE.test(inquiry.email)) missing.push('email');
  if (missing.length) return res.status(400).json({ error: 'Заполните обязательные поля', fields: missing });
  const list = store.readJSON('inquiries.json', []);
  list.unshift(inquiry);
  store.writeJSON('inquiries.json', list);
  res.json({ ok: true, id: inquiry.id });
});

app.get('/api/inquiries', requireAuth, (req, res) => {
  const list = store.readJSON('inquiries.json', []);
  // Manager видит только заявки, закреплённые за ним; admin — все.
  const visible = req.user.role === 'manager'
    ? list.filter((x) => x.assignee === req.user.name)
    : list;
  res.json(visible);
});

// Смена стадии / ответственного
app.patch('/api/inquiries/:id', requireAuth, (req, res) => {
  const list = store.readJSON('inquiries.json', []);
  const item = list.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Заявка не найдена' });
  const b = req.body || {};
  if (b.stage !== undefined) {
    if (!STAGES.includes(b.stage)) return res.status(400).json({ error: 'Неизвестная стадия' });
    if (b.stage !== item.stage) {
      item.history.push({ at: new Date().toISOString(), from: item.stage, to: b.stage, by: req.user.name });
      item.stage = b.stage;
    }
  }
  if (b.assignee !== undefined) {
    item.assignee = clean(b.assignee, 120) || null;
    item.history.push({ at: new Date().toISOString(), from: item.assignee, to: item.assignee, by: req.user.name, type: 'assignee' });
  }
  store.writeJSON('inquiries.json', list);
  res.json({ ok: true, inquiry: item });
});

// Комментарий менеджера
app.post('/api/inquiries/:id/comments', requireAuth, (req, res) => {
  const list = store.readJSON('inquiries.json', []);
  const item = list.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Заявка не найдена' });
  const text = clean(req.body?.text, 1000);
  if (!text) return res.status(400).json({ error: 'Пустой комментарий' });
  item.comments.push({ at: new Date().toISOString(), by: req.user.name, text });
  store.writeJSON('inquiries.json', list);
  res.json({ ok: true, inquiry: item });
});

// ---------- пользователи и сессии ----------
app.get('/api/users', requireAuth, (req, res) => {
  res.json(store.readJSON('users.json', []).map((u) => ({ login: u.login, name: u.name, role: u.role })));
});

app.post('/api/login', (req, res) => {
  const result = auth.login(String(req.body?.login || ''), String(req.body?.password || ''));
  if (!result) return res.status(401).json({ error: 'Неверный логин или пароль' });
  res.setHeader('Set-Cookie', `ns_session=${result.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
  res.json({ ok: true, user: result.user });
});

app.post('/api/logout', (req, res) => {
  auth.logout(auth.parseCookies(req.headers.cookie).ns_session);
  res.setHeader('Set-Cookie', 'ns_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
  res.json({ user });
});

// ---------- 404 ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Не найдено' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`NordSea Export MVP запущен: http://localhost:${PORT}`);
});
