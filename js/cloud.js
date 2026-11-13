/* SCIENCE OS — облачный клиент Supabase (REST, без зависимостей).
   Секреты здесь НЕ хранятся: используется только публичный анонимный ключ
   из www/js/env.js (файл в .gitignore). Данные защищены RLS на сервере. */
(function () {
  'use strict';
  const env = window.SCIENCE_OS_ENV || {};
  const BASE = String(env.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = String(env.supabaseAnonKey || '');

  const SKEY = 'sci_cloud_session_v1';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { session = null; }

  function configured() { return !!(BASE && KEY); }
  function authed() { return !!(configured() && session && session.access_token); }
  function userId() { return session ? session.user_id : null; }
  function nick() { return session ? session.nick : null; }

  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
  }
  function tokenExpiresAt() {
    try {
      const payload = JSON.parse(b64urlDecode(session.access_token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : 0;
    } catch (e) { return 0; }
  }

  async function refresh() {
    if (!session || !session.refresh_token) { clearSession(); return false; }
    const r = await fetch(BASE + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!r.ok) { clearSession(); return false; }
    const data = await r.json();
    saveSession(data);
    return true;
  }

  async function ensureToken() {
    if (!session) return false;
    const exp = tokenExpiresAt();
    if (exp && Date.now() > exp - 60000) return await refresh();
    return true;
  }

  function saveSession(data) {
    // data: ответ Supabase auth (access_token, refresh_token, user)
    const user = data.user || {};
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: user.id,
      nick: (user.user_metadata && user.user_metadata.nick) || null,
      email: user.email || null
    };
    localStorage.setItem(SKEY, JSON.stringify(session));
  }
  function clearSession() {
    session = null;
    localStorage.removeItem(SKEY);
  }

  // Универсальный вызов PostgREST: Cloud.rest('GET', 'diary_entries?...&select=*')
  async function rest(method, path, body) {
    if (!configured()) throw new Error('Облако не настроено (отсутствует www/js/env.js).');
    if (!await ensureToken()) throw new Error('Нужно войти в облачный аккаунт.');
    const opts = {
      method,
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      }
    };
    if (method !== 'GET' && body !== undefined) opts.body = JSON.stringify(body);
    if (method === 'POST' || method === 'PATCH') opts.headers['Prefer'] = 'return=representation';
    const r = await fetch(BASE + '/rest/v1/' + path, opts);
    if (r.status === 401) { // токен истёк — одна попытка обновить и повторить
      if (await refresh()) return rest(method, path, body);
      throw new Error('Сессия истекла, войдите заново.');
    }
    if (!r.ok) {
      let msg = 'Ошибка сети (' + r.status + ')';
      try { const e = await r.json(); msg = (e.message || msg); } catch (e2) {}
      throw new Error(msg);
    }
    if (r.status === 204) return [];
    return r.json();
  }

  async function signUp(email, password, nickValue) {
    if (!configured()) throw new Error('Облако не настроено (отсутствует www/js/env.js).');
    const r = await fetch(BASE + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY },
      body: JSON.stringify({ email, password, data: { nick: nickValue || email.split('@')[0] } })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.msg || data.error_description || data.error || 'Ошибка регистрации');
    if (data.access_token) {
      saveSession(data);
      // гарантируем строку профиля (на случай, если триггер ещё не создан)
      rest('POST', 'profiles', { id: session.user_id, nick: session.nick }).catch(function () {});
    } else {
      // подтверждение email включено: письмо отправлено, вход после подтверждения
      return { needsConfirm: true };
    }
    return { ok: true };
  }

  async function signIn(email, password) {
    if (!configured()) throw new Error('Облако не настроено (отсутствует www/js/env.js).');
    const r = await fetch(BASE + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.error || 'Ошибка входа');
    saveSession(data);
    return true;
  }

  async function signOut() {
    if (configured() && session) {
      try {
        await fetch(BASE + '/auth/v1/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + session.access_token },
          body: '{}'
        });
      } catch (e) { /* локальный выход всё равно выполняется */ }
    }
    clearSession();
  }

  // ---------- Вход через Google (OAuth-redirect, работает в браузере) ----------
  function googleLogin() {
    if (!configured()) { alert('Облако не настроено (нет www/js/env.js).'); return; }
    if (location.protocol === 'file:') {
      alert('Google-вход не может вернуться в файл, открытый напрямую (file://).\n\n' +
        'Как сделать:\n' +
        '1) Запусти локальный сервер: npm run start (папка science-os) и открой http://localhost:3000\n' +
        '2) Или выложи приложение на хостинг (Netlify/GitHub Pages) и открывай по https://');
      return;
    }
    // Честное предупреждение: пока в Supabase не включён провайдер Google,
    // Supabase сам вернёт ошибку — приложение её покажет после перехода.
    location.href = BASE + '/auth/v1/authorize?provider=google&redirect_to=' +
      encodeURIComponent(location.href.split('#')[0]);
  }
  // Обработка возврата после OAuth: токены приходят в #access_token=...
  function handleOAuthRedirect() {
    if (!location.hash || location.hash.indexOf('access_token=') === -1) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    const at = p.get('access_token');
    if (!at) return false;
    let payload = {};
    try { payload = JSON.parse(b64urlDecode(at.split('.')[1])); } catch (e) {}
    session = {
      access_token: at,
      refresh_token: p.get('refresh_token') || null,
      user_id: payload.sub || null,
      nick: (payload.user_metadata && payload.user_metadata.nick) || payload.email || null,
      email: payload.email || null
    };
    localStorage.setItem(SKEY, JSON.stringify(session));
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  window.Cloud = { configured, authed, userId, nick, signUp, signIn, signOut, rest, refresh, ensureToken, googleLogin, handleOAuthRedirect };
})();
