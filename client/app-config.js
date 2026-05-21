(function initTouhouConfig() {
  function normalizeUrl(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
  }

  const globalConfig = window.__THFM_CONFIG__ || {};
  const apiFromMeta = document.querySelector('meta[name="thfm-api-base"]')?.content;
  const socketFromMeta = document.querySelector('meta[name="thfm-socket-url"]')?.content;

  // When served from localhost (server also serves the client during dev),
  // always use same-origin so the hardcoded production URL doesn't break local dev.
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

  const apiBaseUrl = isLocalHost
    ? ''
    : normalizeUrl(
        globalConfig.apiBaseUrl || apiFromMeta || localStorage.getItem('THFM_API_BASE_URL') || ''
      );
  const socketUrl = isLocalHost
    ? ''
    : normalizeUrl(
        globalConfig.socketUrl || socketFromMeta || localStorage.getItem('THFM_SOCKET_URL') || apiBaseUrl
      );

  function resolveApiUrl(input) {
    if (typeof input !== 'string' || !input.startsWith('/api/')) return input;
    return apiBaseUrl ? `${apiBaseUrl}${input}` : input;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init = {}) {
    const resolvedInput = resolveApiUrl(input);
    const nextInit = { ...init };
    if (typeof input === 'string' && input.startsWith('/api/') && !nextInit.credentials) {
      nextInit.credentials = 'include';
    }
    return nativeFetch(resolvedInput, nextInit);
  };

  function createSocket(options = {}) {
    if (typeof window.io !== 'function') {
      throw new Error('Socket.IO client is not available');
    }

    const finalOptions = {
      withCredentials: true,
      ...options
    };

    if (socketUrl) {
      return window.io(socketUrl, finalOptions);
    }

    return window.io(finalOptions);
  }

  window.THFM_CONFIG = Object.freeze({
    apiBaseUrl,
    socketUrl,
    resolveApiUrl,
    createSocket
  });
})();
