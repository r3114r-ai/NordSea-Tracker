// Автотест ролей B2B-платформы NordSea Export.
// Проверяет три сценария:
//   1. Клиент отправляет заявку → данные сохраняются.
//   2. Admin входит и видит ВСЕ заявки.
//   3. Manager входит и видит ТОЛЬКО СВОИ заявки (фильтрация по assignee).
//
// Запуск:  node _scripts/test-roles.js
// Опции:   NS_BASE=http://localhost:3000  NS_ADMIN_PASS=...  NS_MANAGER_PASS=...
// Тестовая заявка помечается словом [TEST] — её можно удалить вручную из data/inquiries.json.

const BASE = process.env.NS_BASE || 'http://localhost:3000';
const ADMIN_LOGIN = process.env.NS_ADMIN_LOGIN || 'admin';
const ADMIN_PASS = process.env.NS_ADMIN_PASS || 'admin123';
const MANAGER_LOGIN = process.env.NS_MANAGER_LOGIN || 'manager';
const MANAGER_PASS = process.env.NS_MANAGER_PASS || 'manager123';

let passed = 0;
let failed = 0;
const results = [];

function check(name, cond, details) {
  if (cond) {
    passed++;
    results.push(`  ✓ ${name}`);
  } else {
    failed++;
    results.push(`  ✗ ${name}${details ? ` — ${details}` : ''}`);
  }
}

async function http(method, path, { body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* не-JSON ответ */ }
  const setCookie = res.headers.get('set-cookie');
  const token = setCookie ? /ns_session=([^;]+)/.exec(setCookie)?.[1] : null;
  return { status: res.status, data, token };
}

function cookieOf(token) {
  return `ns_session=${token}`;
}

async function main() {
  console.log(`\nТестируем ${BASE}\n`);

  // ---------- Сценарий 1: клиент отправляет заявку ----------
  console.log('Сценарий 1. Клиент заполняет и отправляет заявку');
  const stamp = new Date().toISOString().slice(0, 19);
  const inquiryBody = {
    company: '[TEST] Pacific Trading Co.',
    country: 'Singapore',
    contactName: 'Test Runner',
    email: `test-${Date.now()}@example.com`,
    phone: '+65 000 000',
    product: 'Frozen pollock',
    volume: '2 FCL',
    message: `Автотест ${stamp}`,
    lang: 'en',
  };
  const send = await http('POST', '/api/inquiries', { body: inquiryBody });
  check('POST /api/inquiries возвращает 200', send.status === 200, `получен ${send.status}`);
  check('Сервер вернул ok:true и id заявки', send.status === 200 && send.data?.ok === true && typeof send.data?.id === 'string');
  const testId = send.data?.id;

  // защита от спама не должна сработать на одиночном запросе
  check('Одиночный запрос не попадает под rate-limit (не 429)', send.status !== 429);

  // невалидная заявка должна отклоняться
  const badSend = await http('POST', '/api/inquiries', { body: { company: '', country: '', contactName: '', email: 'not-an-email' } });
  check('Заявка без обязательных полей отклоняется (400)', badSend.status === 400 && Array.isArray(badSend.data?.fields), `получен ${badSend.status}`);

  // ---------- Сценарий 2: admin входит и видит все заявки ----------
  console.log('\nСценарий 2. Admin входит и видит все заявки');

  const anonList = await http('GET', '/api/inquiries');
  check('Без авторизации список заявок недоступен (401)', anonList.status === 401, `получен ${anonList.status}`);

  const adminLogin = await http('POST', '/api/login', { body: { login: ADMIN_LOGIN, password: ADMIN_PASS } });
  check(`Admin входит (${ADMIN_LOGIN})`, adminLogin.status === 200 && adminLogin.data?.user?.role === 'admin', `получен ${adminLogin.status}`);
  const adminCookie = adminLogin.token ? cookieOf(adminLogin.token) : null;

  const adminList = await http('GET', '/api/inquiries', { cookie: adminCookie });
  check('Admin получает список заявок (200, массив)', adminList.status === 200 && Array.isArray(adminList.data), `получен ${adminList.status}`);
  const adminCount = Array.isArray(adminList.data) ? adminList.data.length : 0;
  check('Список заявок не пуст', adminCount > 0, `заявок: ${adminCount}`);
  check(
    'Новая тестовая заявка видна в списке admin (данные сохранились)',
    Array.isArray(adminList.data) && adminList.data.some((x) => x.id === testId)
  );
  const saved = Array.isArray(adminList.data) ? adminList.data.find((x) => x.id === testId) : null;
  check('Поля заявки сохранены без искажений', !!saved && saved.company === inquiryBody.company && saved.email === inquiryBody.email && saved.stage === 'new');

  // ---------- Сценарий 3: manager видит только свои заявки ----------
  console.log('\nСценарий 3. Manager входит и имеет ограниченный доступ');

  const mgrLogin = await http('POST', '/api/login', { body: { login: MANAGER_LOGIN, password: MANAGER_PASS } });
  check(`Manager входит (${MANAGER_LOGIN})`, mgrLogin.status === 200 && mgrLogin.data?.user?.role === 'manager', `получен ${mgrLogin.status}`);
  const mgrCookie = mgrLogin.token ? cookieOf(mgrLogin.token) : null;

  const mgrList = await http('GET', '/api/inquiries', { cookie: mgrCookie });
  check('Manager получает список заявок (200, массив)', mgrList.status === 200 && Array.isArray(mgrList.data), `получен ${mgrList.status}`);

  const mgrCount = Array.isArray(mgrList.data) ? mgrList.data.length : 0;
  const mgrName = mgrLogin.data?.user?.name || MANAGER_LOGIN;
  const ownOnly = Array.isArray(mgrList.data) && mgrList.data.every((x) => x.assignee === mgrName);
  if (mgrCount === 0) {
    check('Manager видит только свои заявки (фильтрация по assignee)', true, '— у manager нет закреплённых заявок, список пуст (это корректная фильтрация)');
  } else {
    check(
      `Manager видит только свои заявки (фильтрация по assignee)`,
      ownOnly,
      `manager видит ${mgrCount} из ${adminCount} заявок, в т.ч. чужие — фильтрации в API нет`
    );
  }

  // Manager не должен уметь добавлять продукты (только admin)
  const mgrProduct = await http('POST', '/api/products', { cookie: mgrCookie, body: { name: { en: '[TEST] Should fail' } } });
  check('Manager НЕ может добавлять продукты (403)', mgrProduct.status === 403, `получен ${mgrProduct.status}`);

  const adminProduct = await http('POST', '/api/products', { cookie: adminCookie, body: { name: { en: '[TEST] role check product' }, categoryId: 'frozen-fish', icon: '🧪' } });
  check('Admin может добавлять продукты (200)', adminProduct.status === 200, `получен ${adminProduct.status}`);

  // ---------- Итог ----------
  console.log('\n──────── Результаты ────────');
  results.forEach((r) => console.log(r));
  console.log(`────────────────────────────`);
  console.log(`Пройдено: ${passed}, провалено: ${failed}\n`);

  if (testId) console.log(`Тестовая заявка: id=${testId}. Удалить из трекера можно правкой data/inquiries.json.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Ошибка запуска тестов:', e.message);
  console.error('Убедитесь, что сервер запущен: npm start');
  process.exit(2);
});
