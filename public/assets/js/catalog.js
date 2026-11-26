// Каталог: загрузка данных и отрисовка категорий (главная) и карточек (продукция).
window.CATALOG = null;

window.loadCatalog = async function () {
  if (window.CATALOG) return window.CATALOG;
  const res = await fetch('/api/products');
  window.CATALOG = await res.json();
  return window.CATALOG;
};

const lang = () => window.currentLang;
const pick = (obj) => (obj ? obj[lang()] || obj.en || '' : '');

function productCard(p) {
  const el = document.createElement('article');
  el.className = 'prod-card';
  el.innerHTML =
    '<div class="prod-ph"></div>' +
    '<div class="prod-body">' +
    '  <h3></h3>' +
    '  <div class="latin"></div>' +
    '  <dl></dl>' +
    '  <div class="price-note"><span></span><a class="req-link"></a></div>' +
    '</div>';
  el.querySelector('.prod-ph').textContent = p.icon || '🐟';
  el.querySelector('h3').textContent = pick(p.name) || pick(p.name, 'en');
  el.querySelector('.latin').textContent = p.latin || '';

  const dl = el.querySelector('dl');
  [
    ['products.lbl.specs', p.specs],
    ['products.lbl.pack', p.pack],
    ['products.lbl.moq', p.moq],
    ['products.lbl.season', p.season],
  ].forEach(([key, obj]) => {
    const val = pick(obj);
    if (!val) return;
    const dt = document.createElement('dt');
    dt.textContent = window.t(key);
    const dd = document.createElement('dd');
    dd.textContent = val;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });

  el.querySelector('.price-note span').textContent = window.t('products.priceNote');
  const link = el.querySelector('.req-link');
  link.textContent = window.t('products.request');
  link.href = 'inquiry.html?product=' + encodeURIComponent(p.id);
  return el;
}

function renderHomeCategories(data) {
  const host = document.getElementById('home-cats');
  if (!host) return;
  host.innerHTML = '';
  data.categories.forEach((c) => {
    const count = data.products.filter((p) => p.categoryId === c.id && p.visible !== false).length;
    const card = document.createElement('a');
    card.className = 'cat-card';
    card.href = 'products.html?cat=' + encodeURIComponent(c.id);
    card.innerHTML = '<div class="icon"></div><h3></h3><p></p><span class="more"></span>';
    card.querySelector('.icon').textContent = c.icon || '🐟';
    card.querySelector('h3').textContent = pick(c.name);
    card.querySelector('p').textContent = count + ' ' + window.t('products.items');
    card.querySelector('.more').textContent = window.t('home.categories.all') + ' →';
    host.appendChild(card);
  });
}

let activeCat = 'all';

function renderChips(data) {
  const host = document.getElementById('chips');
  if (!host) return;
  host.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'chip' + (activeCat === 'all' ? ' active' : '');
  all.textContent = window.t('products.filter.all');
  all.addEventListener('click', () => { activeCat = 'all'; renderChips(data); renderProducts(data); });
  host.appendChild(all);
  data.categories.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'chip' + (activeCat === c.id ? ' active' : '');
    b.textContent = (c.icon || '') + ' ' + pick(c.name);
    b.addEventListener('click', () => { activeCat = c.id; renderChips(data); renderProducts(data); });
    host.appendChild(b);
  });
}

function renderProducts(data) {
  const host = document.getElementById('prod-grid');
  if (!host) return;
  host.innerHTML = '';
  const visible = data.products.filter(
    (p) => p.visible !== false && (activeCat === 'all' || p.categoryId === activeCat)
  );
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.style.color = '#5A6B7A';
    empty.textContent = window.t('products.empty');
    host.appendChild(empty);
    return;
  }
  visible.forEach((p) => host.appendChild(productCard(p)));
}

function renderAll(data) {
  renderHomeCategories(data);
  renderChips(data);
  renderProducts(data);
}

document.addEventListener('DOMContentLoaded', () => {
  const cat = new URLSearchParams(location.search).get('cat');
  if (cat) activeCat = cat;
  window.loadCatalog().then(renderAll);
  document.addEventListener('langchange', () => window.loadCatalog().then(renderAll));
});
