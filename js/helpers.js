// Central helper namespace to avoid duplicate global functions. Safe to include in both dev and prod.
(function () {
    window.RB = window.RB || {};
    window.RB.helpers = window.RB.helpers || {};

    if (!window.RB.helpers.delay) {
        window.RB.helpers.delay = function (ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        };
    }

    // Expose a global delay function if not already present (backwards compatibility)
    if (typeof window.delay === 'undefined') {
        window.delay = function (ms) {
            return window.RB.helpers.delay(ms);
        };
    }
})();
