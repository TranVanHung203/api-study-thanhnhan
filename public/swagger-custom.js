// Custom script injected into Swagger UI
// - capture /auth/login responses and store access token in localStorage
// - add Authorization header from localStorage to all outgoing requests
(function() {
  function safeJson(resp) {
    try {
      return resp.clone().json();
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // Patch fetch to capture login responses
  const origFetch = window.fetch.bind(window);
  window.fetch = function() {
    const args = Array.from(arguments);
    return origFetch.apply(null, args).then(function(resp) {
      try {
        const req = args[0];
        const method = (args[1] && args[1].method) || 'GET';
        // detect login endpoint - adjust path if your login path differs
        if (typeof req === 'string' && req.includes('/auth/login') && method.toUpperCase() === 'POST') {
          safeJson(resp).then(function(data) {
            if (data && (data.accessToken || data.token || data.access_token)) {
              const token = data.accessToken || data.token || data.access_token;
              try { localStorage.setItem('access_token', token); } catch (e) {}
            }
          }).catch(()=>{});
        }
      } catch (e) {}
      return resp;
    });
  };

  // When Swagger UI `ui` becomes available, set a requestInterceptor
  function attachInterceptor() {
    if (window.ui && window.ui.getConfigs) {
      const cfg = window.ui.getConfigs();
      // Preserve existing interceptor if present
      const prev = cfg.requestInterceptor;
      cfg.requestInterceptor = function(req) {
        try {
          const token = localStorage.getItem('access_token');
          if (token) req.headers['Authorization'] = 'Bearer ' + token;
        } catch (e) {}
        if (typeof prev === 'function') return prev(req);
        return req;
      };

      // Optionally, auto-fill the authorize button (preauthorize) if token exists
      try {
        const token = localStorage.getItem('access_token');
        if (token && window.ui) {
          try {
            // For bearerAuth, set Authorization header for all requests
            // Some swagger-ui versions support preauthorizeApiKey for apiKey schemes; we rely on requestInterceptor above.
            // Call ui.preauthorizeApiKey if available
            if (typeof window.ui.preauthorizeApiKey === 'function') {
              window.ui.preauthorizeApiKey('bearerAuth', token);
            }
          } catch(e){}
        }
      } catch(e){}

      return true;
    }
    return false;
  }

  const interval = setInterval(function() {
    if (attachInterceptor()) clearInterval(interval);
  }, 300);
})();

// Additionally, attempt to enable TryItOut programmatically for swagger-ui instances
(function enableTryItOut() {
  const enable = function() {
    if (!window.ui) return false;
    try {
      // Some swagger-ui builds expose config via ui.getConfigs(); modify it
      const cfg = window.ui.getConfigs && window.ui.getConfigs();
      if (cfg) {
        // allow submitting methods
        cfg.supportedSubmitMethods = cfg.supportedSubmitMethods && cfg.supportedSubmitMethods.length ? cfg.supportedSubmitMethods : ['get', 'post', 'put', 'delete', 'patch'];
        // set try it out enabled flag if UI supports it
        if (window.ui.tryItOutEnabled === undefined) window.ui.tryItOutEnabled = true;
      }
      // Some versions expose a `tryItOutEnabled` setter
      if (typeof window.ui.setTryItOutEnabled === 'function') {
        window.ui.setTryItOutEnabled(true);
      }
      return true;
    } catch (e) {
      return false;
    }
  };
  const it = setInterval(function() { if (enable()) clearInterval(it); }, 300);
})();

// Auto-click 'Try it out' buttons so fields are editable without manual toggle
(function autoClickTryItOut() {
  const trySelectors = [
    "button.try-out", // older
    "button.btn.try-out", // variant
    "button.opblock-control__btn.try-out", // variant
    "button[title='Try it out']",
    "button[aria-label='Try it out']"
  ];

  function clickVisibleTryButtons() {
    try {
      // find buttons by selectors or by text content
      const buttons = new Set();
      trySelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(b => buttons.add(b));
      });
      // fallback: search by text
      document.querySelectorAll('button').forEach(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        if (/try it out/.test(t) || /try it/i.test(t)) buttons.add(b);
      });

      buttons.forEach(btn => {
        if (!btn) return;
        // don't re-click same button
        if (btn.dataset && btn.dataset.autoclicked) return;
        // only click if visible and enabled
        const style = window.getComputedStyle(btn);
        if (style && style.display === 'none') return;
        try {
          btn.click();
          if (btn.dataset) btn.dataset.autoclicked = '1';
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Run initially and periodically for a short time
  clickVisibleTryButtons();
  const interval = setInterval(clickVisibleTryButtons, 500);
  // stop after 10s
  setTimeout(() => clearInterval(interval), 10000);

  // Also observe DOM for new opblocks and click their try buttons
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        clickVisibleTryButtons();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
