export const Services = (() => {
  function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => {
        console.log('Service Worker Registered');
      });
    }
  }
  return { init };
})();
