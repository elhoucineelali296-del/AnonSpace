
(function () {
    var KEY = 'anonspace_theme';
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}

    function systemPrefersDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function isDark() {
        return saved ? saved === 'dark' : systemPrefersDark();
    }

    function apply() {
        var dark = isDark();
        document.documentElement.classList.toggle('dark', dark);

        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#161b21' : '#DCCFC0');

        document.querySelectorAll('#theme-toggle i').forEach(function (icon) {
            icon.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        });
        document.querySelectorAll('#theme-toggle').forEach(function (btn) {
            btn.setAttribute('title', dark ? 'الوضع النهاري' : 'الوضع الليلي');
        });
    }

    window.toggleTheme = function () {
        saved = isDark() ? 'light' : 'dark';
        try { localStorage.setItem(KEY, saved); } catch (e) {}
        apply();
    };

    apply();
    document.addEventListener('DOMContentLoaded', function () {
        apply();
        document.querySelectorAll('#theme-toggle').forEach(function (btn) {
            btn.addEventListener('click', window.toggleTheme);
        });
    });
})();
