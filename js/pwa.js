if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.querySelectorAll('.pwa-install-btn').forEach(b => b.classList.remove('hidden'));
});
document.addEventListener('click', async e => {
    const btn = e.target.closest && e.target.closest('.pwa-install-btn');
    if (!btn || !deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.querySelectorAll('.pwa-install-btn').forEach(b => b.classList.add('hidden'));
});
window.addEventListener('appinstalled', () => {
    document.querySelectorAll('.apk-card').forEach(c => c.classList.add('hidden'));
});