// Общая логика сайта: применение словаря, переключатель языка, мобильное меню.
document.addEventListener('DOMContentLoaded', function () {
  window.applyI18n();

  document.querySelectorAll('.lang-switch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.setLang(btn.dataset.lang);
    });
  });

  var burger = document.querySelector('.burger');
  var nav = document.querySelector('.nav-links');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      nav.classList.toggle('open');
      burger.classList.toggle('open');
    });
  }

  document.querySelectorAll('.lang-switch').forEach(function (sw) {
    sw.classList.remove('hidden-until-i18n');
  });
});
