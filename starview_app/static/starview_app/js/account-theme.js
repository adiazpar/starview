// Native account pages share the React application's saved appearance preference.
(() => {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const applyTheme = () => {
    let preference;
    try {
      preference = localStorage.getItem('theme');
    } catch {
      // Storage can be unavailable in privacy modes; system appearance still works.
    }
    const light = preference === 'light' ||
      (preference !== 'dark' && media.matches);
    if (light) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  };
  applyTheme();
  media.addEventListener('change', applyTheme);
  window.addEventListener('storage', applyTheme);
})();
