/* Keep the selected mobile surface stable when the device rotates. */
(() => {
  if (window.fiveEDesktop) return;
  const preference = new URLSearchParams(location.search).get('mobile');
  const enabled = preference === '1' || (preference !== '0'
    && matchMedia('(pointer: coarse) and (max-width: 900px)').matches);
  if (!enabled) return;
  document.documentElement.classList.add('mobile-image-mode');
  document.querySelector('meta[name="viewport"]').content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
})();
