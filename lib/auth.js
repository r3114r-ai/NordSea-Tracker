// Авторизация: учётные записи в data/users.json (соль + SHA-256),
// сессии — в памяти процесса (HttpOnly-cookie). Роли: admin, manager.
const crypto = require('crypto');
const store = require('./store');

const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 часов
const sessions = new Map(); // token -> { userId, expires }

function hash(salt, password) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function login(loginName, password) {
  const users = store.readJSON('users.json', []);
  const u = users.find(
    (u) => u.login === loginName && u.passwordHash === hash(u.salt, password)
  );
  if (!u) return null;
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: u.id, expires: Date.now() + SESSION_TTL });
  return { token, user: { id: u.id, login: u.login, name: u.name, role: u.role } };
}

function verify(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const users = store.readJSON('users.json', []);
  const u = users.find((u) => u.id === s.userId);
  if (!u) return null;
  return { id: u.id, login: u.login, name: u.name, role: u.role };
}

function logout(token) {
  if (token) sessions.delete(token);
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

module.exports = { login, verify, logout, parseCookies, hash };
