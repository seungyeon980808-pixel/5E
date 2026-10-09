'use strict';
const filters = document.querySelector('.filters');
const buttons = [...filters.querySelectorAll('[data-filter]')];
const services = [...document.querySelectorAll('.service')];
const status = document.querySelector('#filter-status');
filters.hidden = false;
for (const button of buttons) {
  button.addEventListener('click', () => {
    const selected = button.dataset.filter;
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
    for (const service of services) service.hidden = selected !== 'all' && service.dataset.category !== selected;
    status.textContent = `${button.textContent}: ${services.filter(service => !service.hidden).length}개 도구가 표시됩니다.`;
  });
}
