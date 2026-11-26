// Inquiry-форма: валидация и отправка B2B-запроса в трекер.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('inquiry-form');
  if (!form) return;

  const success = document.getElementById('success-box');
  const submitBtn = form.querySelector('button[type="submit"]');
  const select = document.getElementById('f-product');

  function markInvalid(id, on) {
    const input = document.getElementById(id);
    const field = input.closest('.field');
    if (field) field.classList.toggle('invalid', !!on);
  }

  function value(id) {
    return document.getElementById(id).value.trim();
  }

  // Продукция из каталога + предвыбор из ?product=
  window.loadCatalog().then((data) => {
    if (!select) return;
    select.innerHTML = '';
    const other = document.createElement('option');
    other.value = '';
    other.textContent = window.t('form.productOther');
    select.appendChild(other);
    data.products
      .filter((p) => p.visible !== false)
      .forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name[window.currentLang] || p.name.en;
        select.appendChild(opt);
      });
    const pre = new URLSearchParams(location.search).get('product');
    if (pre && select.querySelector('option[value="' + CSS.escape(pre) + '"]')) {
      select.value = pre;
    }
    document.addEventListener('langchange', () => {
      const cur = select.value;
      select.querySelector('option').textContent = window.t('form.productOther');
      Array.from(select.options).slice(1).forEach((opt, i) => {
        const p = data.products.filter((x) => x.visible !== false)[i];
        if (p) opt.textContent = p.name[window.currentLang] || p.name.en;
      });
      select.value = cur;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    ['company', 'country', 'contact', 'email'].forEach((f) => markInvalid('f-' + f, false));
    if (select) markInvalid('f-product', false);

    const payload = {
      company: value('f-company'),
      country: value('f-country'),
      contactName: value('f-contact'),
      email: value('f-email'),
      phone: value('f-phone'),
      product: select && select.value ? select.options[select.selectedIndex].textContent : '',
      volume: value('f-volume'),
      message: value('f-message'),
      lang: window.currentLang,
    };

    let ok = true;
    ['company', 'country', 'contact'].forEach((f) => {
      if (!payload[f]) { markInvalid('f-' + f, true); ok = false; }
    });
    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      markInvalid('f-email', true); ok = false;
    }
    if (!ok) return;

    submitBtn.disabled = true;
    submitBtn.textContent = window.t('form.sending');
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        (err.fields || []).forEach((f) => {
          const map = { company: 'f-company', country: 'f-country', contactName: 'f-contact', email: 'f-email' };
          if (map[f]) markInvalid(map[f], true);
        });
        throw new Error('bad request');
      }
      form.style.display = 'none';
      success.style.display = 'block';
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      alert(window.t('form.error'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = window.t('form.submit');
    }
  });

  const again = document.getElementById('send-again');
  if (again) {
    again.addEventListener('click', () => {
      form.reset();
      form.style.display = '';
      success.style.display = 'none';
    });
  }
});
