// JSON-хранилище с атомарной записью.
// Задел на масштабирование: при росте заменяется на PostgreSQL
// без изменения маршрутов — интерфейс (readJSON/writeJSON) остаётся прежним.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJSON(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = filePath(name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, filePath(name));
}

module.exports = { readJSON, writeJSON, DATA_DIR };
