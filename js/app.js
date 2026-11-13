/* SCIENCE OS v2 — приложение (vanilla JS, офлайн-first + облачные функции Supabase).
   Сетевые функции честно сообщают, если облако не настроено, и никогда не имитируют работу. */
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- ЛОКАЛЬНОЕ ХРАНИЛИЩЕ (офлайн-режим сохранён) ----------
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
let account = store.get('science_os_guest_v1', null);

// ---------- НАУЧНЫЕ ОТДЕЛЫ ----------
const DEPTS = [
  ['astro', '🔭 Астрономия и космос'],
  ['meteo', '🌦 Метеорология'],
  ['bio', '🌿 Биология и экология'],
  ['chem', '⚗️ Химия'],
  ['phys', '🧲 Физика'],
  ['math', '📐 Математика'],
  ['geo', '🌋 Геология'],
  ['radio', '📡 Радиоастрономия и связь']
];
const deptName = code => { const d = DEPTS.find(x => x[0] === code); return d ? d[1] : code || '—'; };

// ---------- ДОСТИЖЕНИЯ ----------
const ACH = [
  ['first_entry', '📓 Первая запись', 'Сделать первую запись в дневнике'],
  ['ten_entries', '📚 Летописец', 'Сделать 10 записей в дневнике'],
  ['first_mod', '🧩 Первый мод', 'Создать свой первый мод'],
  ['five_mods', '🛠️ Мододел', 'Создать 5 модов'],
  ['first_friend', '🤝 Коллега', 'Добавить первого друга'],
  ['quiz_perfect', '🎯 Без промаха', '5 из 5 в викторине'],
  ['reaction_fast', '⚡ Молния', 'Реакция быстрее 300 мс'],
  ['night_scientist', '🌙 Ночной учёный', 'Запись в дневнике после 23:00'],
  ['sky_chart', '🌌 Звездочёт', 'Построить карту звёздного неба'],
  ['solar_tour', '🪐 Экскурсатор', 'Изучить 4 планеты в симуляторе'],
  ['cloud_linked', '☁️ На связи', 'Подключить облачный аккаунт']
];

// ---------- УВЕДОМЛЕНИЯ ----------
function notify(text, opts) {
  opts = opts || {};
  const list = store.get('sci_notifications', []);
  list.unshift({ text, type: opts.type || 'info', read: false, at: Date.now() });
  store.set('sci_notifications', list.slice(0, 100));
  drawNotifBadge();
  toast(text);
  // в облако уведомления для СЕБЯ не дублируем (RLS-политика actor-а);
  // облачные уведомления приходят от других пользователей (friend request и т.п.)
}
function drawNotifBadge() {
  let n = 0;
  if (Cloud.authed()) {
    const cached = store.get('sci_notif_unread', 0);
    n = cached;
  }
  const local = store.get('sci_notifications', []).filter(x => !x.read).length;
  n = Math.max(n, local);
  const b = $('notifBadge');
  if (!b) return;
  b.textContent = n;
  b.classList.toggle('hidden', !n);
}
let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- ДОСТИЖЕНИЯ: выдача ----------
function unlockAchievement(key) {
  const local = store.get('sci_achievements', []);
  if (local.includes(key)) return;
  local.push(key);
  store.set('sci_achievements', local);
  const def = ACH.find(a => a[0] === key);
  notify('🏆 Достижение: ' + (def ? def[1] : key), { type: 'ach' });
  if (Cloud.authed()) {
    Cloud.rest('POST', 'achievements?on_conflict=key', { user_id: Cloud.userId(), key: key })
      .catch(e => console.warn('ach sync:', e.message));
  }
}
function achievementCountLocal() { return store.get('sci_achievements', []).length; }

// ---------- СТАТУС ОБЛАКА ----------
function refreshCloudStatus() {
  const el = $('cloudStatus');
  if (!el) return;
  if (!Cloud.configured()) { el.innerHTML = '<span class="err">облако не настроено (офлайн-режим)</span>'; }
  else if (Cloud.authed()) { el.innerHTML = '<span class="ok">облако: ' + esc(Cloud.nick() || 'онлайн') + '</span>'; }
  else { el.textContent = 'облако настроено, вход не выполнен'; }
}
function netGuard() {
  if (!Cloud.configured()) return { ok: false, msg: 'Облачные функции пока отключены: не создан www/js/env.js с настройками Supabase.' };
  if (!Cloud.authed()) return { ok: false, msg: 'Нужен вход в облачный аккаунт (раздел «Аккаунт»).' };
  return { ok: true };
}

// ---------- АВТОРИЗАЦИЯ ----------
function cloudSignUp() {
  const email = $('authEmail').value.trim(), pass = $('authPass').value, nick = $('authNick').value.trim();
  if (!email || !pass) return alert('Введите email и пароль');
  if (pass.length < 6) return alert('Пароль минимум 6 символов');
  const st = $('authState');
  st.textContent = 'Регистрация…';
  Cloud.signUp(email, pass, nick).then(res => {
    if (res && res.needsConfirm) {
      st.innerHTML = '📧 Supabase отправил письмо для подтверждения. Подтвердите email и войдите кнопкой «Войти».';
      return;
    }
    afterCloudLogin(true);
  }).catch(e => { st.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; });
}
function cloudSignIn() {
  const email = $('authEmail').value.trim(), pass = $('authPass').value;
  if (!email || !pass) return alert('Введите email и пароль');
  const st = $('authState');
  st.textContent = 'Вход…';
  Cloud.signIn(email, pass).then(() => afterCloudLogin(false))
    .catch(e => { st.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; });
}
async function afterCloudLogin(isNew) {
  if (isNew) unlockAchievement('cloud_linked');
  store.set('sci_notif_unread', 0);
  refreshCloudStatus();
  callPollStart();
  // подтягиваем непрочитанные облачные уведомления
  Cloud.rest('GET', 'notifications?user_id=eq.' + Cloud.userId() + '&read=eq.false&select=*')
    .then(rows => { store.set('sci_notif_unread', rows.length); drawNotifBadge(); }).catch(() => {});
  if (isNew && account && confirm('Найден гостевой профиль «' + account.nick + '». Перенести его дневник и моды в облако?')) {
    await pushLocalToCloud();
  }
  backHome();
  toast(isNew ? 'Аккаунт создан и выполнен вход' : 'Вход выполнен');
}
async function cloudSignOut() {
  callPollStop();
  if (pc || currentCall) endCall(false);
  await Cloud.signOut();
  refreshCloudStatus(); drawNotifBadge();
  toast('Вышли из облака');
  backHome();
}
async function pushLocalToCloud() {
  if (!Cloud.authed()) return alert('Сначала войдите в облако');
  const diary = store.get('sci_diary', []);
  const mods = store.get('sci_mods', []);
  const rows = diary.map(d => ({ user_id: Cloud.userId(), title: d.title || '', text: d.text || '', is_public: !!d.pub }));
  const mrows = mods.map(m => ({ author: Cloud.userId(), name: m.name || 'мод', description: m.desc || '', code: m.code || '' }));
  try {
    if (rows.length) await Cloud.rest('POST', 'diary_entries', rows);
    if (mrows.length) await Cloud.rest('POST', 'mods', mrows);
    store.set('sci_diary', []); store.set('sci_mods', []);
    toast('Перенесено: ' + rows.length + ' записей, ' + mrows.length + ' модов');
  } catch (e) { alert('Ошибка переноса: ' + e.message); }
}

// ---------- ГОСТЕВОЙ ПРОФИЛЬ (как в v1) ----------
function register() {
  const nick = $('nickname').value.trim();
  if (!nick) return alert('Введи никнейм');
  account = { nick, id: 'SCI-' + Math.random().toString(36).slice(2, 9).toUpperCase(), dept: null, bio: '', avatar: '🔬' };
  store.set('science_os_guest_v1', account);
  $('register').classList.add('hidden');
  showHome();
}
function logoutLocal() {
  if (!confirm('Удалить локальный гостевой профиль? (Облачный аккаунт не затрагивается)')) return;
  localStorage.removeItem('science_os_guest_v1');
  account = null;
  location.reload();
}

// ---------- НАВИГАЦИЯ ----------
let pollTimer = null;
function clearPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  stopSolar(); // останавливаем анимацию симулятора при уходе со страницы
  stopVideoPlayer(); // останавливаем плеер и освобождаем память
}
function backHome() { clearPoll(); $('page').classList.add('hidden'); $('auth').classList.add('hidden'); showHome(); }
function showHome() {
  clearPoll();
  if (account || Cloud.authed()) {
    $('home').classList.remove('hidden');
    $('register').classList.add('hidden');
    const who = Cloud.authed() ? Cloud.nick() : (account && account.nick);
    $('welcome').textContent = 'Привет, ' + esc(who || 'учёный') + '!';
    $('homeSub').textContent = (Cloud.authed() ? 'Режим: облако' : 'Режим: гостевой (офлайн)') +
      ' · Отдел: ' + deptName((Cloud.authed() ? store.get('sci_profile_dept', null) : account && account.dept));
    drawNotifBadge();
  } else {
    $('register').classList.remove('hidden');
  }
}
const PAGE_TITLES = {
  messages: 'СООБЩЕНИЯ', friends: 'ДРУЗЬЯ', diary: 'ДНЕВНИК', browser: 'SCIENCE BROWSER',
  games: 'НАУЧНЫЕ ИГРЫ', modlib: 'БИБЛИОТЕКА МОДОВ', mods: 'МАСТЕРСКАЯ МОДОВ',
  achievements: 'ДОСТИЖЕНИЯ', departments: 'НАУЧНЫЕ ОТДЕЛЫ', lab: 'ЛАБОРАТОРИЯ',
  science: 'НАУЧНЫЙ ЦЕНТР', profile: 'ПРОФИЛЬ', settings: 'АККАУНТ',
  notifications: 'УВЕДОМЛЕНИЯ', astro: 'АСТРОНОМИЯ', solar: 'СОЛНЕЧНАЯ СИСТЕМА', videos: 'ВИДЕО', auth: ''
};
function openPage(name) {
  clearPoll();
  $('home').classList.add('hidden');
  $('register').classList.add('hidden');
  if (name === 'auth') { $('auth').classList.remove('hidden'); $('page').classList.add('hidden'); return; }
  $('auth').classList.add('hidden');
  $('page').classList.remove('hidden');
  $('pageTitle').textContent = PAGE_TITLES[name] || name.toUpperCase();
  $('content').innerHTML = '';
  const fn = { messages, friends, diary, browser, games, modlib, mods, achievements, departments, lab, science, profile, settings, notifications, astro, solar, videos }[name];
  if (fn) fn();
}

// ---------- СООБЩЕНИЯ И ЧАТ ----------
let dmPeer = null;          // {id, nick} для личного чата
let chatDept = 'all';       // 'all' или код отдела
function messages() {
  const g = netGuard();
  if (!g.ok) { $('content').innerHTML = '<div class="panel"><div class="notice">💬 ' + esc(g.msg) + '</div></div>'; return; }
  $('content').innerHTML = '<div class="panel">' +
    '<div class="grid"><button class="tab active" id="tabGlobal" onclick="chatViewGlobal()">🌐 Общий чат</button>' +
    '<button class="tab" id="tabDm" onclick="chatViewDm()">✉️ Личные сообщения</button></div>' +
    '<div id="chatArea"></div></div>';
  chatViewGlobal();
}
function chatViewGlobal() {
  dmPeer = null;
  $('tabGlobal').classList.add('active'); $('tabDm').classList.remove('active');
  $('chatArea').innerHTML =
    '<p><small>Отдел:</small> <select id="deptSel" style="display:inline-block;width:auto">' +
    '<option value="all">🌐 Весь Science OS</option>' +
    DEPTS.map(d => '<option value="' + d[0] + '"' + (d[0] === chatDept ? ' selected' : '') + '>' + d[1] + '</option>').join('') +
    '</select></p>' +
    '<div id="chatBox" class="chatbox"></div>' +
    '<div class="statusline" id="chatStatus">загрузка…</div>' +
    '<textarea id="chatInput" placeholder="Сообщение (Enter — отправить)"></textarea>' +
    '<button onclick="sendGlobal()">Отправить ➤</button>';
  $('deptSel').onchange = () => { chatDept = $('deptSel').value; loadGlobal(); };
  loadGlobal();
  clearPoll(); pollTimer = setInterval(loadGlobal, 5000);
}
function chatViewDm(keepPeer) {
  clearPoll();
  if (!keepPeer) dmPeer = null;
  $('tabDm').classList.add('active'); $('tabGlobal').classList.remove('active');
  $('chatArea').innerHTML =
    '<p><small>Открой чат с другом из списка или введи ник:</small></p>' +
    '<input id="dmNick" placeholder="Никнейм друга">' +
    '<button onclick="dmByNick()">Открыть чат</button>' +
    '<div id="dmList"></div><div id="dmArea"></div>';
  if (dmPeer) renderDm();
  loadFriendsForDm();
}
async function loadFriendsForDm() {
  try {
    const uid = Cloud.userId();
    const fr = await Cloud.rest('GET', 'friendships?or=(requester.eq.' + uid + ',addressee.eq.' + uid + ')&status=eq.accepted&select=*');
    const others = fr.map(f => f.requester === uid ? f.addressee : f.requester);
    if (!others.length) { $('dmList').innerHTML = '<div class="notice">Пока нет друзей — добавь их в разделе «Друзья».</div>'; return; }
    const profiles = await Cloud.rest('GET', 'profiles?id=in.(' + others.join(',') + ')&select=id,nick,avatar');
    $('dmList').innerHTML = profiles.map(p =>
      '<button onclick="openDm(\'' + p.id + '\',\'' + esc(p.nick).replace(/'/g, "\\'") + '\')">💬 ' + avatarHtml(p, 20) + ' ' + esc(p.nick) + '</button>').join('');
  } catch (e) { $('dmList').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}
async function dmByNick() {
  const nick = $('dmNick').value.trim();
  if (!nick) return;
  try {
    const p = await Cloud.rest('GET', 'profiles?nick=eq.' + encodeURIComponent(nick) + '&select=id,nick,avatar');
    if (!p.length) return alert('Пользователь не найден');
    openDm(p[0].id, p[0].nick);
  } catch (e) { alert(e.message); }
}
function openDm(id, nick) {
  dmPeer = { id, nick };
  if ($('dmArea')) { // уже на странице сообщений во вкладке «Личные»
    renderDm(); loadDm(); clearPoll(); pollTimer = setInterval(loadDm, 5000);
  } else { // из другого раздела (профиль, друзья) — переключаемся
    openPage('messages');
    chatViewDm(true);
    if (dmPeer) { renderDm(); loadDm(); clearPoll(); pollTimer = setInterval(loadDm, 5000); }
  }
}
function renderDm() {
  $('dmArea').innerHTML = '<div class="panel"><h3>✉️ ' + esc(dmPeer.nick) + '</h3>' +
    '<div id="dmBox" class="chatbox"></div><div class="statusline" id="dmStatus"></div>' +
    '<textarea id="dmInput" placeholder="Личное сообщение (Enter — отправить)"></textarea>' +
    '<button onclick="sendDm()">Отправить ➤</button></div>';
  const inp = $('dmInput');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); } });
}
function chatHtml(rows, uid, ppl) {
  return rows.map(m => {
    const mine = m.sender === uid;
    const who = mine ? 'я' : esc((ppl && ppl[m.sender] && ppl[m.sender].nick) || 'собеседник');
    const t = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return '<div class="msg ' + (mine ? 'mine' : '') + '"><span class="who">' + who + ' · ' + t + '</span>' + esc(m.text) + '</div>';
  }).join('');
}
// Подтягиваем профили отдельным запросом (JOIN через auth.users не работает)
async function fetchProfilesMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = await Cloud.rest('GET', 'profiles?id=in.(' + uniq.join(',') + ')&select=id,nick,avatar,avatar_img,role');
  const m = {};
  rows.forEach(r => m[r.id] = r);
  return m;
}
async function loadGlobal() {
  if (!dmPeer && !$('chatBox')) return;
  const box = $('chatBox'), st = $('chatStatus');
  if (!box) return;
  try {
    let path = 'messages?recipient=is.null&dept=is.null';
    if (chatDept !== 'all') path = 'messages?recipient=is.null&dept=eq.' + chatDept;
    path += '&select=*&order=created_at.desc&limit=50';
    const rows = await Cloud.rest('GET', path);
    rows.reverse();
    const ppl = await fetchProfilesMap(rows.map(m => m.sender));
    box.innerHTML = chatHtml(rows, Cloud.userId(), ppl);
    box.scrollTop = box.scrollHeight;
    st.textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU') + ' · автообновление каждые 5 с';
  } catch (e) {
    st.innerHTML = '<span class="err">' + esc(e.message) + ' — покажем данные, когда связь появится.</span>';
  }
}
async function loadDm() {
  if (!dmPeer || !$('dmBox')) return;
  const uid = Cloud.userId();
  try {
    const rows = await Cloud.rest('GET',
      'messages?or=(and(sender.eq.' + uid + ',recipient.eq.' + dmPeer.id + '),and(sender.eq.' + dmPeer.id + ',recipient.eq.' + uid + '))' +
      '&select=*&order=created_at.desc&limit=50');
    rows.reverse();
    const ppl = await fetchProfilesMap(rows.map(m => m.sender));
    const box = $('dmBox');
    box.innerHTML = chatHtml(rows, uid, ppl);
    box.scrollTop = box.scrollHeight;
    $('dmStatus').textContent = 'обновлено ' + new Date().toLocaleTimeString('ru-RU');
  } catch (e) { $('dmStatus').innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
}
async function sendGlobal() {
  const inp = $('chatInput'), text = inp.value.trim();
  if (!text) return;
  const body = { sender: Cloud.userId(), recipient: null, dept: chatDept === 'all' ? null : chatDept, text };
  inp.value = '';
  try { await Cloud.rest('POST', 'messages', body); loadGlobal(); }
  catch (e) { $('chatStatus').innerHTML = '<span class="err">' + esc(e.message) + '</span>'; inp.value = text; }
}
async function sendDm() {
  const inp = $('dmInput'), text = inp.value.trim();
  if (!text || !dmPeer) return;
  const body = { sender: Cloud.userId(), recipient: dmPeer.id, text };
  inp.value = '';
  try { await Cloud.rest('POST', 'messages', body); loadDm(); }
  catch (e) { $('dmStatus').innerHTML = '<span class="err">' + esc(e.message) + '</span>'; inp.value = text; }
}

// ---------- ДРУЗЬЯ ----------
async function friends() {
  const g = netGuard();
  if (!g.ok) { $('content').innerHTML = '<div class="panel"><div class="notice">👥 ' + esc(g.msg) + '</div></div>'; return; }
  $('content').innerHTML = '<div class="panel"><h3>Найти по нику</h3>' +
    '<input id="frNick" placeholder="Никнейм пользователя">' +
    '<button onclick="addFriend()">＋ Отправить заявку</button></div>' +
    '<div id="frArea"><div class="statusline">загрузка…</div></div>';
  loadFriends();
}
async function loadFriends() {
  const uid = Cloud.userId();
  try {
    const fr = await Cloud.rest('GET', 'friendships?or=(requester.eq.' + uid + ',addressee.eq.' + uid + ')&select=*&order=created_at.desc');
    const accepted = [], incoming = [], outgoing = [];
    fr.forEach(f => {
      if (f.status === 'accepted') accepted.push(f);
      else if (f.addressee === uid) incoming.push(f);
      else outgoing.push(f);
    });
    const ids = [...new Set(fr.flatMap(f => [f.requester, f.addressee]).filter(x => x !== uid))];
    let people = {};
    if (ids.length) {
      const ps = await Cloud.rest('GET', 'profiles?id=in.(' + ids.join(',') + ')&select=id,nick,avatar,dept');
      ps.forEach(p => people[p.id] = p);
    }
    const card = (p, f, actions) =>
      '<div class="panel"><div class="profilecard">' + avatarHtml(p, 44) +
      '<div><b>' + esc(p && p.nick || '???') + '</b><br><small>' + deptName(p && p.dept) + '</small></div></div>' +
      '<div class="grid">' + actions + '</div>' +
      '<button class="ghost" onclick="viewProfile(\'' + f + '\')">Профиль</button></div>';
    let html = '';
    if (incoming.length) html += '<h3>📥 Входящие заявки</h3>' + incoming.map(f =>
      card(people[f.requester], f.requester,
        '<button onclick="acceptFriend(\'' + f.id + '\')">✅ Принять</button>' +
        '<button class="danger" onclick="removeFriend(\'' + f.id + '\')">✖ Отклонить</button>')).join('');
    if (accepted.length) html += '<h3>🤝 Друзья</h3>' + accepted.map(f => {
      const otherId = f.requester === uid ? f.addressee : f.requester;
      const p = people[otherId];
      return card(p, otherId,
        '<button onclick="startCall(\'' + otherId + '\',\'' + esc(p && p.nick || '').replace(/'/g, "\\'") + '\')">📞 Позвонить</button>' +
        '<button onclick="openDm(\'' + otherId + '\',\'' + esc(p && p.nick || '').replace(/'/g, "\\'") + '\')">💬 Написать</button>' +
        '<button class="danger" onclick="removeFriend(\'' + f.id + '\')">✖ Удалить</button>');
    }).join('');
    if (outgoing.length) html += '<h3>📤 Отправленные заявки</h3>' + outgoing.map(f =>
      card(people[f.addressee], f.addressee,
        '<button class="danger" onclick="removeFriend(\'' + f.id + '\')">Отменить</button>')).join('');
    if (!html) html = '<div class="notice">Пока пусто. Найди друзей по нику!</div>';
    $('frArea').innerHTML = html;
  } catch (e) { $('frArea').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}
async function addFriend() {
  const nick = $('frNick').value.trim();
  if (!nick) return;
  try {
    const p = await Cloud.rest('GET', 'profiles?nick=eq.' + encodeURIComponent(nick) + '&select=id,nick');
    if (!p.length) return alert('Пользователь не найден');
    if (p[0].id === Cloud.userId()) return alert('Это вы 🙂');
    await Cloud.rest('POST', 'friendships', { requester: Cloud.userId(), addressee: p[0].id });
    await Cloud.rest('POST', 'notifications', { user_id: p[0].id, actor_id: Cloud.userId(), type: 'friend', text: 'Заявка в друзья от ' + (Cloud.nick() || 'учёного') });
    unlockAchievement('first_friend');
    toast('Заявка отправлена ' + p[0].nick);
    loadFriends();
  } catch (e) {
    alert(e.message.includes('duplicate') ? 'Заявка уже существует' : e.message);
  }
}
async function acceptFriend(fid) {
  try {
    await Cloud.rest('PATCH', 'friendships?id=eq.' + fid, { status: 'accepted' });
    toast('Заявка принята');
    loadFriends();
  } catch (e) { alert(e.message); }
}
async function removeFriend(fid) {
  if (!confirm('Удалить эту связь?')) return;
  try { await Cloud.rest('DELETE', 'friendships?id=eq.' + fid); loadFriends(); }
  catch (e) { alert(e.message); }
}

// ---------- ПРОФИЛИ ----------
async function viewProfile(userId) {
  $('page').classList.remove('hidden'); $('home').classList.add('hidden');
  $('pageTitle').textContent = 'ПРОФИЛЬ';
  $('content').innerHTML = '<div class="statusline">загрузка…</div>';
  try {
    const p = (await Cloud.rest('GET', 'profiles?id=eq.' + userId + '&select=*'))[0];
    if (!p) throw new Error('Профиль не найден');
    const ach = await Cloud.rest('GET', 'achievements?user_id=eq.' + userId + '&select=key').catch(() => []);
    const modsCount = (await Cloud.rest('GET', 'mods?author=eq.' + userId + '&select=id')).length;
    $('content').innerHTML = '<div class="panel"><div class="profilecard">' + avatarHtml(p, 56) +
      '<div><h3>' + esc(p.nick) + (p.role === 'owner' ? ' 👑' : '') + '</h3><small>' + deptName(p.dept) + (p.role === 'owner' ? ' · владелец Science OS' : '') + '</small></div></div>' +
      '<p>' + esc(p.bio || 'Описание пока пустое.') + '</p>' +
      '<p>🏆 Достижений: ' + ach.length + ' · 🧩 Модов: ' + modsCount + '</p>' +
      '<div class="grid">' + ACH.filter(a => ach.some(x => x.key === a[0])).map(a => '<div class="panel ach done">' + a[1] + '</div>').join('') + '</div>' +
      '<button onclick="openDm(\'' + p.id + '\',\'' + esc(p.nick).replace(/'/g, "\\'") + '\')">💬 Написать</button></div>';
  } catch (e) { $('content').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}
async function profile() {
  const g = netGuard();
  if (!g.ok) {
    const myAv = account && account.avatarImg && AVATAR_RE.test(account.avatarImg)
      ? '<img src="' + account.avatarImg + '" style="width:56px;height:56px;border-radius:12px;object-fit:cover">' : '<span class="avatar">🔬</span>';
    $('content').innerHTML = '<div class="panel"><h3>Гостевой профиль</h3>' +
      '<div class="profilecard">' + myAv + '<div><p>Ник: ' + esc(account ? account.nick : '—') + '</p>' +
      '<p>ID: ' + esc(account ? account.id : '—') + '</p></div></div>' +
      '<input id="avFile" type="file" accept="image/*" style="display:none" onchange="uploadAvatar(this)">' +
      '<button onclick="document.getElementById(\'avFile\').click()">📷 Загрузить своё фото</button>' +
      '<button class="ghost" onclick="clearAvatar()">🗑 Убрать фото</button>' +
      '<button onclick="copyId()">Скопировать ID</button>' +
      '<div class="notice">👤 ' + esc(g.msg) + '</div></div>' +
      wallpaperPanel();
    return;
  }
  try {
    const uid = Cloud.userId();
    let p = (await Cloud.rest('GET', 'profiles?id=eq.' + uid + '&select=*'))[0];
    if (!p) {
      await Cloud.rest('POST', 'profiles', { id: uid, nick: Cloud.nick() || 'учёный' });
      p = { id: uid, nick: Cloud.nick(), dept: null, bio: '', avatar: '🔬' };
    }
    const ach = await Cloud.rest('GET', 'achievements?user_id=eq.' + uid + '&select=key').catch(() => []);
    store.set('sci_profile_dept', p.dept);
    $('content').innerHTML = '<div class="panel"><h3>Мой профиль</h3>' +
      '<div class="profilecard">' + avatarHtml(p, 56) +
      '<div><small>Сейчас стоит:</small><br><small>можно эмодзи или своё фото</small></div></div>' +
      '<input id="avFile" type="file" accept="image/*" style="display:none" onchange="uploadAvatar(this)">' +
      '<button onclick="document.getElementById(\'avFile\').click()">📷 Загрузить своё фото</button>' +
      '<button class="ghost" onclick="clearAvatar()">🗑 Убрать фото</button>' +
      '<div class="grid3">' + ['🔬', '🚀', '🧪', '🦎', '🌌', '☄️'].map(a =>
        '<button onclick="saveProfile({avatar:\'' + a + '\'})"' + (p.avatar === a ? ' class="active"' : '') + '>' + a + '</button>').join('') + '</div>' +
      '<p><small>Отдел:</small></p><select id="pfDept">' +
      '<option value="">— не выбран —</option>' + DEPTS.map(d => '<option value="' + d[0] + '"' + (p.dept === d[0] ? ' selected' : '') + '>' + d[1] + '</option>').join('') + '</select>' +
      '<p><small>О себе:</small></p><textarea id="pfBio" placeholder="Расскажи о своих исследованиях">' + esc(p.bio) + '</textarea>' +
      '<button onclick="saveProfile()">Сохранить профиль</button>' +
      '<p>🏆 Достижений: ' + ach.length + ' из ' + ACH.length + '</p></div>';
  } catch (e) { $('content').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}
async function saveProfile(patch) {
  patch = patch || {};
  if ($('pfDept')) patch.dept = $('pfDept').value || null;
  if ($('pfBio')) patch.bio = $('pfBio').value;
  try {
    await Cloud.rest('PATCH', 'profiles?id=eq.' + Cloud.userId(), patch);
    store.set('sci_profile_dept', patch.dept);
    toast('Профиль сохранён');
  } catch (e) { alert(e.message); }
}

// ---------- ДНЕВНИК (личный + общий) ----------
let diaryTab = 'mine';
function diary() {
  $('content').innerHTML = '<div class="panel">' +
    '<div class="grid"><button class="tab ' + (diaryTab === 'mine' ? 'active' : '') + '" id="tabMine" onclick="diaryTab=\'mine\';diary()">🔒 Личный</button>' +
    '<button class="tab ' + (diaryTab === 'shared' ? 'active' : '') + '" id="tabShared" onclick="diaryTab=\'shared\';diary()">🌍 Общий</button></div>' +
    '<p><small>' + (diaryTab === 'shared' ? 'Записи с флажком «в общий дневник» видят все пользователи облака.' : 'Личные записи видишь только ты.') + '</small></p>' +
    '<input id="diaryTitle" placeholder="Название записи" maxlength="80">' +
    '<textarea id="diaryText" placeholder="Твоё наблюдение..."></textarea>' +
    '<label><input type="checkbox" id="diaryPublic" style="width:auto"> В общий дневник</label>' +
    '<button onclick="saveDiary()">Сохранить</button>' +
    '<button onclick="diary()">🔄 Обновить</button></div>' +
    '<div id="entries"><div class="statusline">загрузка…</div></div>';
  showDiary();
}
async function saveDiary() {
  const title = $('diaryTitle').value.trim(), text = $('diaryText').value.trim();
  if (!title && !text) return alert('Пустая запись');
  const isPublic = $('diaryPublic').checked;
  const hour = new Date().getHours();
  const entry = { title, text, pub: isPublic, at: Date.now() };
  const list = store.get('sci_diary', []);
  list.unshift(entry);
  store.set('sci_diary', list);
  if (hour >= 23 || hour < 5) unlockAchievement('night_scientist');
  unlockAchievement('first_entry');
  if (store.get('sci_diary', []).length >= 10) unlockAchievement('ten_entries');
  const g = netGuard();
  if (g.ok) {
    try {
      await Cloud.rest('POST', 'diary_entries', { user_id: Cloud.userId(), title, text, is_public: isPublic });
      toast('Запись сохранена в облако');
    } catch (e) { toast('Сохранено локально (облако: ' + e.message + ')'); }
  } else {
    toast('Запись сохранена локально');
  }
  diary();
}
async function showDiary() {
  const g = netGuard();
  let entries = [];
  if (g.ok) {
    try {
      const uid = Cloud.userId();
      const path = diaryTab === 'shared'
        ? 'diary_entries?is_public=eq.true&select=*&order=created_at.desc&limit=50'
        : 'diary_entries?user_id=eq.' + uid + '&select=*&order=created_at.desc&limit=100';
      const rows = await Cloud.rest('GET', path);
      const ppl = await fetchProfilesMap(rows.map(r => r.user_id));
      entries = rows.map(r => ({
        title: r.title, text: r.text,
        who: ppl[r.user_id] ? ppl[r.user_id].nick : null,
        when: new Date(r.created_at).toLocaleString('ru-RU'),
        cloud: true
      }));
    } catch (e) {
      $('entries').innerHTML = '<div class="notice">Облако недоступно (' + esc(e.message) + '), показаны локальные записи.</div>';
    }
  }
  if (!entries.length) {
    entries = store.get('sci_diary', []).map(x => ({
      title: x.title, text: x.text,
      when: x.at ? new Date(x.at).toLocaleString('ru-RU') : '', cloud: false
    }));
  }
  $('entries').innerHTML = entries.length
    ? entries.map(x => '<div class="panel"><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p>' +
        '<small>' + esc(x.who ? (x.who + ' · ') : '') + esc(x.when) + (x.cloud ? ' · ☁️' : ' · 💾') + '</small></div>').join('')
    : '<div class="notice">Записей пока нет.</div>';
}

// ---------- БРАУЗЕР (сохранены функции v1) ----------
let tabs = [], activeTab = 0;
function browser() {
  if (!tabs.length) tabs = [{ url: 'https://www.google.com/webhp?igu=1' }];
  $('content').innerHTML = '<div class="panel">' +
    '<input id="address" placeholder="Адрес сайта или поисковый запрос">' +
    '<button onclick="navigate()">Перейти 🔎</button>' +
    '<button onclick="newTab()">＋ Вкладка</button>' +
    '<button onclick="bookmark()">☆ Закладка</button>' +
    '<button onclick="showBookmarks()">⭐ Закладки</button>' +
    '<button onclick="showHistory()">🕘 История</button>' +
    '<div id="tabsBar" class="tabs"></div>' +
    '<iframe id="browserFrame"></iframe>' +
    '<p><small>Многие сайты (Google, Википедия) запрещают встраивание. Если страница пуста — используй «Открыть отдельно».</small></p>' +
    '<button onclick="external()">Открыть отдельно</button>' +
    '<div id="browserExtra"></div></div>';
  drawTabs(); loadTab();
}
function normalize(s) {
  s = s.trim();
  if (!s) return 'https://www.google.com';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes('.') && !s.includes(' ')) return 'https://' + s;
  return 'https://www.google.com/search?q=' + encodeURIComponent(s);
}
function navigate() {
  const url = normalize($('address').value);
  tabs[activeTab] = { url };
  store.set('sci_last', url);
  const h = store.get('sci_history', []);
  h.unshift(url);
  store.set('sci_history', h.slice(0, 100));
  drawTabs(); loadTab();
}
function loadTab() {
  $('address').value = tabs[activeTab].url;
  $('browserFrame').src = tabs[activeTab].url;
}
function drawTabs() {
  $('tabsBar').innerHTML = tabs.map((t, i) =>
    '<button class="tab ' + (i === activeTab ? 'active' : '') + '" onclick="switchTab(' + i + ')">Вкладка ' + (i + 1) + '</button>').join('');
}
function switchTab(i) { activeTab = i; drawTabs(); loadTab(); }
function newTab() {
  tabs.push({ url: 'https://www.google.com/webhp?igu=1' });
  activeTab = tabs.length - 1; drawTabs(); loadTab();
}
function bookmark() {
  const b = store.get('sci_bookmarks', []);
  b.push(tabs[activeTab].url);
  store.set('sci_bookmarks', [...new Set(b)]);
  toast('Закладка сохранена!');
}
function showBookmarks() {
  const b = store.get('sci_bookmarks', []);
  $('browserExtra').innerHTML = '<h3>Закладки</h3>' + (b.length ? b.map(u => '<p>' + esc(u) + '</p>').join('') : '<div class="notice">Пусто</div>');
}
function showHistory() {
  const h = store.get('sci_history', []);
  $('browserExtra').innerHTML = '<h3>История</h3>' + (h.length ? h.map(u => '<p>' + esc(u) + '</p>').join('') : '<div class="notice">Пусто</div>');
}
function external() { window.open(normalize($('address').value), '_blank'); }

// ---------- НАУЧНЫЕ ИГРЫ ----------
const quiz = [
  ['Планеты', 'Какая планета самая большая?', ['Земля', 'Юпитер', 'Марс'], 1],
  ['Космос', 'Как называется наша галактика?', ['Андромеда', 'Млечный Путь', 'Сомбреро'], 1],
  ['Погода', 'Чем измеряют давление?', ['Барометр', 'Компас', 'Линейка'], 0],
  ['Животные', 'Кто является млекопитающим?', ['Дельфин', 'Акула', 'Черепаха'], 0],
  ['Химия', 'Формула воды?', ['CO2', 'O2', 'H2O'], 2],
  ['Земля', 'Что находится под земной корой?', ['Мантия', 'Облака', 'Океан'], 0],
  ['Звёзды', 'Чем является Солнце?', ['Планетой', 'Звездой', 'Кометой'], 1],
  ['Радиоастрономия', 'Что изучает радиоастрономия?', ['Радиосигналы космоса', 'Растения', 'Минералы'], 0],
  ['Математика', 'Сколько будет 9 × 8?', ['64', '72', '81'], 1],
  ['Экология', 'Что поглощают растения при фотосинтезе?', ['Гелий', 'CO2', 'Водород'], 1]
];
let gameIndex = 0, score = 0, gameNumber = 0;
function games() {
  $('content').innerHTML = '<div class="panel"><h3>Выбери игру:</h3>' +
    '<div class="grid"><button onclick="startGame(0)">🎯 Викторина</button>' +
    '<button onclick="startReaction()">⚡ Реакция</button>' +
    '<button onclick="showLeaderboard()">🏅 Таблица лидеров</button></div>' +
    '<div id="gameArea"></div></div>';
}
function startGame(i) { gameNumber = i; gameIndex = 0; score = 0; question(); }
function question() {
  const q = quiz[gameNumber];
  $('gameArea').innerHTML = '<h3>' + esc(q[0]) + '</h3><p>Вопрос ' + (gameIndex + 1) + ' из 5</p><h3>' + esc(q[1]) + '</h3>' +
    '<div id="answers">' + q[2].map((a, i) => '<button onclick="answer(' + i + ')">' + esc(a) + '</button>').join('') + '</div>' +
    '<p id="feedback"></p><p>Очки: ' + score + '</p>';
}
function answer(i) {
  const q = quiz[gameNumber];
  const correct = i === q[3];
  if (correct) score++;
  $('feedback').textContent = correct ? '✅ Правильно!' : '❌ Правильный ответ: ' + q[2][q[3]];
  document.querySelectorAll('#answers button').forEach(b => b.disabled = true);
  const btn = document.createElement('button');
  btn.textContent = gameIndex === 4 ? 'Результат' : 'Дальше';
  btn.onclick = () => {
    gameIndex++;
    if (gameIndex === 5) {
      if (score === 5) unlockAchievement('quiz_perfect');
      saveScore('quiz', score);
      $('gameArea').innerHTML = '<h2>Результат: ' + score + ' из 5</h2><button onclick="games()">К играм</button>';
    } else question();
  };
  $('gameArea').appendChild(btn);
}
// Игра «Реакция»
let rtState = null;
function startReaction() {
  rtState = { waiting: false, t0: 0 };
  $('gameArea').innerHTML = '<h3>⚡ Тест реакции</h3>' +
    '<p>Жди, пока фон зажжётся зелёным, и жми!</p>' +
    '<button id="rtBtn" style="min-height:120px" onclick="reactionClick()">Начать</button>' +
    '<p id="rtResult"></p>';
}
function reactionClick() {
  const b = $('rtBtn');
  if (!rtState.waiting) {
    rtState.waiting = true;
    b.textContent = 'Жди зелёный…';
    b.disabled = true;
    setTimeout(() => {
      if (!rtState) return;
      rtState.t0 = Date.now();
      b.disabled = false;
      b.style.background = '#1e8f4e';
      b.textContent = 'ЖМИ!';
      window.__rtTimeout = setTimeout(() => {
        if (rtState && rtState.t0) { endReaction(false); }
      }, 1500);
    }, 1200 + Math.random() * 2500);
  } else {
    clearTimeout(window.__rtTimeout);
    endReaction(true);
  }
}
function endReaction(hit) {
  const ms = Date.now() - rtState.t0;
  rtState = null;
  $('rtBtn').style.background = '';
  $('rtBtn').textContent = 'Ещё раз';
  $('rtBtn').disabled = false;
  if (!hit) {
    $('rtResult').textContent = '⏰ Слишком долго! Попробуй ещё.';
    return;
  }
  $('rtResult').innerHTML = '⏱ Время: <b>' + ms + ' мс</b>';
  if (ms < 300) unlockAchievement('reaction_fast');
  saveScore('reaction', Math.max(0, Math.round(1000 - ms / 2)));
}
async function saveScore(game, value) {
  const best = store.get('sci_best_' + game, 0);
  if (value > best) { store.set('sci_best_' + game, value); toast('Новый личный рекорд: ' + value); }
  if (Cloud.authed()) {
    Cloud.rest('POST', 'game_scores', { user_id: Cloud.userId(), game, score: value }).catch(() => {});
  }
}
async function showLeaderboard() {
  const g = netGuard();
  if (!g.ok) {
    $('gameArea').innerHTML = '<h3>🏅 Личные рекорды</h3>' +
      ['quiz', 'reaction'].map(k => '<p>' + (k === 'quiz' ? 'Викторина' : 'Реакция') + ': ' + store.get('sci_best_' + k, '—') + '</p>').join('') +
      '<div class="notice">' + esc(g.msg) + '</div>';
    return;
  }
  try {
    const rows = await Cloud.rest('GET', 'game_scores?select=*&order=score.desc&limit=10');
    const ppl = await fetchProfilesMap(rows.map(r => r.user_id));
    $('gameArea').innerHTML = '<h3>🏅 Топ-10 (все игры)</h3>' + (rows.length
      ? rows.map((r, i) => '<p>' + (i + 1) + '. ' + esc(ppl[r.user_id] ? ppl[r.user_id].nick : '???') + ' — ' + r.score + ' (' + esc(r.game) + ')</p>').join('')
      : '<div class="notice">Ещё нет результатов — сыграй первым!</div>');
  } catch (e) { $('gameArea').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}

// ---------- МАСТЕРСКАЯ МОДОВ ----------
function mods() {
  const list = store.get('sci_mods', []);
  $('content').innerHTML = '<div class="panel"><h3>Создать мод</h3>' +
    '<input id="modName" placeholder="Название" maxlength="60">' +
    '<textarea id="modDesc" placeholder="Краткое описание (публичная часть)"></textarea>' +
    '<textarea id="modCode" placeholder="Код / данные мода"></textarea>' +
    '<button onclick="saveMod()">💾 Сохранить локально</button>' +
    (Cloud.authed() ? '<button onclick="publishMod()">☁️ Опубликовать в библиотеку</button>' : '') +
    '</div><div id="modList">' + (list.length
      ? list.map((x, i) => '<div class="panel"><h3>' + esc(x.name) + '</h3><p>' + esc(x.desc || '') + '</p><pre>' + esc(x.code) + '</pre>' +
          '<button class="danger" onclick="deleteLocalMod(' + i + ')">Удалить</button></div>').join('')
      : '<div class="notice">Локальных модов нет.</div>') + '</div>';
}
function readModForm() {
  const name = $('modName').value.trim(), desc = $('modDesc').value.trim(), code = $('modCode').value;
  if (!name) { alert('Введи название'); return null; }
  return { name, desc, code };
}
function saveMod() {
  const m = readModForm(); if (!m) return;
  const list = store.get('sci_mods', []);
  list.push(m);
  store.set('sci_mods', list);
  if (list.length === 1) unlockAchievement('first_mod');
  if (list.length >= 5) unlockAchievement('five_mods');
  toast('Мод сохранён локально');
  mods();
}
function deleteLocalMod(i) {
  const list = store.get('sci_mods', []);
  list.splice(i, 1);
  store.set('sci_mods', list);
  mods();
}
async function publishMod() {
  const m = readModForm(); if (!m) return;
  try {
    await Cloud.rest('POST', 'mods', { author: Cloud.userId(), name: m.name, description: m.desc, code: m.code });
    unlockAchievement('first_mod');
    toast('Мод опубликован в библиотеке');
    mods();
  } catch (e) { alert(e.message); }
}

// ---------- БИБЛИОТЕКА МОДОВ ----------
async function modlib() {
  const g = netGuard();
  if (!g.ok) {
    $('content').innerHTML = '<div class="panel"><h3>📚 Библиотека модов</h3>' +
      '<div class="notice">☁️ ' + esc(g.msg) + ' Локальные моды доступны в «Мастерской модов».</div></div>';
    return;
  }
  $('content').innerHTML = '<div class="statusline">загрузка библиотеки…</div><div id="libList"></div>';
  try {
    const rows = await Cloud.rest('GET', 'mods?select=*&order=created_at.desc&limit=50');
    const ppl = await fetchProfilesMap(rows.map(r => r.author));
    const likes = rows.length ? await Cloud.rest('GET', 'mod_likes?mod_id=in.(' + rows.map(r => r.id).join(',') + ')&select=mod_id,user_id') : [];
    const myId = Cloud.userId();
    $('libList').innerHTML = rows.length ? rows.map(r => {
      const n = likes.filter(l => l.mod_id === r.id).length;
      const mine = likes.some(l => l.mod_id === r.id && l.user_id === myId);
      return '<div class="panel"><h3>' + esc(r.name) + '</h3>' +
        '<small>автор: ' + esc(ppl[r.author] ? ppl[r.author].nick : '???') + '</small>' +
        '<p>' + esc(r.description) + '</p>' +
        '<pre>' + esc(r.code) + '</pre>' +
        '<button onclick="toggleLike(\'' + r.id + '\',' + (mine ? 'false' : 'true') + ')">' + (mine ? '❤️ ' : '🤍 ') + n + '</button></div>';
    }).join('') : '<div class="notice">Библиотека пуста. Опубликуй первый мод из мастерской!</div>';
  } catch (e) { $('libList').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
}
async function toggleLike(modId, like) {
  try {
    if (like) await Cloud.rest('POST', 'mod_likes', { user_id: Cloud.userId(), mod_id: modId });
    else await Cloud.rest('DELETE', 'mod_likes?user_id=eq.' + Cloud.userId() + '&mod_id=eq.' + modId);
    modlib();
  } catch (e) { alert(e.message); }
}

// ---------- ДОСТИЖЕНИЯ ----------
async function achievements() {
  let unlocked = store.get('sci_achievements', []);
  if (Cloud.authed()) {
    try {
      const rows = await Cloud.rest('GET', 'achievements?user_id=eq.' + Cloud.userId() + '&select=key');
      unlocked = [...new Set([...unlocked, ...rows.map(r => r.key)])];
    } catch (e) { /* офлайн: показываем локальные */ }
  }
  $('content').innerHTML = '<div class="panel"><h3>🏆 ' + unlocked.length + ' из ' + ACH.length + '</h3></div>' +
    ACH.map(a => {
      const done = unlocked.includes(a[0]);
      return '<div class="panel ach ' + (done ? 'done' : '') + '"><span style="font-size:26px">' + (done ? a[1].split(' ')[0] : '🔒') + '</span>' +
        '<div><b>' + a[1] + '</b><br><small>' + a[2] + '</small></div></div>';
    }).join('');
}

// ---------- УВЕДОМЛЕНИЯ ----------
async function notifications() {
  $('content').innerHTML = '<div class="statusline">загрузка…</div><div id="notifList"></div>';
  let items = store.get('sci_notifications', []).map(x => ({ text: x.text, read: x.read, when: new Date(x.at).toLocaleString('ru-RU'), local: true }));
  if (Cloud.authed()) {
    try {
      const rows = await Cloud.rest('GET', 'notifications?user_id=eq.' + Cloud.userId() + '&select=*&order=created_at.desc&limit=50');
      items = [...rows.map(r => ({ text: r.text, read: r.read, when: new Date(r.created_at).toLocaleString('ru-RU'), cloud: true })), ...items];
      Cloud.rest('PATCH', 'notifications?user_id=eq.' + Cloud.userId() + '&read=eq.false', { read: true }).catch(() => {});
      store.set('sci_notif_unread', 0);
    } catch (e) { $('notifList').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  } else {
    store.get('sci_notifications', []).forEach((x, i) => x.read = true);
    store.set('sci_notifications', store.get('sci_notifications', []));
  }
  drawNotifBadge();
  $('notifList').innerHTML = items.length
    ? items.map(x => '<div class="panel ' + (x.read ? 'deptcard' : 'ach done') + '"><b>' + esc(x.text) + '</b><br><small>' + esc(x.when) + (x.cloud ? ' · ☁️' : ' · 💾') + '</small></div>').join('')
    : '<div class="notice">Уведомлений нет.</div>';
}

// ---------- НАУЧНЫЕ ОТДЕЛЫ ----------
function departments() {
  const my = (Cloud.authed() ? store.get('sci_profile_dept', null) : account && account.dept) || null;
  $('content').innerHTML = '<div class="panel"><p>Отдел — это твоё направление в Science OS. У каждого отдела свой чат в «Сообщениях».</p></div>' +
    '<div class="grid">' + DEPTS.map(d =>
      '<div class="panel deptcard ' + (my === d[0] ? 'mine' : '') + '"><h3>' + d[1] + '</h3>' +
      '<button onclick="joinDept(\'' + d[0] + '\')">' + (my === d[0] ? '✓ Мой отдел' : 'Вступить') + '</button>' +
      '<button class="ghost" onclick="chatDept=\'' + d[0] + '\';openPage(\'messages\');chatViewGlobal()">Чат отдела</button></div>').join('') + '</div>';
}
async function joinDept(code) {
  if (Cloud.authed()) {
    try { await Cloud.rest('PATCH', 'profiles?id=eq.' + Cloud.userId(), { dept: code }); store.set('sci_profile_dept', code); toast('Отдел сохранён'); }
    catch (e) { alert(e.message); return; }
  } else if (account) {
    account.dept = code;
    store.set('science_os_guest_v1', account);
    toast('Отдел сохранён локально (в облако — после входа)');
  }
  departments();
}

// ---------- ЛАБОРАТОРИЯ ----------
function lab() {
  $('content').innerHTML = '<div class="panel"><h3>🔬 Лаборатория</h3>' +
    '<p>Идеи: Луна, облака, погода, созвездия, космические данные.</p>' +
    '<h3>⏱ Секундомер наблюдений</h3>' +
    '<div id="swDisplay" style="font-size:32px">0.0 с</div>' +
    '<button onclick="swToggle()" id="swBtn">▶ Старт</button>' +
    '<button onclick="swReset()">Сброс</button>' +
    '<p><small>Засекай время наблюдений (например, покрытие звёзд Луной) и записывай в дневник.</small></p></div>';
}
let swTimer = null, swT0 = 0, swAcc = 0;
function swToggle() {
  const b = $('swBtn'), d = $('swDisplay');
  if (swTimer) {
    clearInterval(swTimer); swTimer = null; swAcc += Date.now() - swT0;
    b.textContent = '▶ Старт';
  } else {
    swT0 = Date.now();
    swTimer = setInterval(() => { d.textContent = ((swAcc + (Date.now() - swT0)) / 1000).toFixed(1) + ' с'; }, 100);
    b.textContent = '⏸ Стоп';
  }
}
function swReset() { if (swTimer) { clearInterval(swTimer); swTimer = null; } swAcc = 0; $('swDisplay').textContent = '0.0 с'; $('swBtn').textContent = '▶ Старт'; }

// ---------- НАУЧНЫЙ ЦЕНТР (как в v1 + расширено) ----------
function science() {
  const sites = [
    ['Wikipedia', 'https://ru.wikipedia.org'], ['NASA', 'https://www.nasa.gov'],
    ['ESA', 'https://www.esa.int'], ['NOAA', 'https://www.noaa.gov'],
    ['Windy', 'https://www.windy.com'], ['WebSDR', 'https://www.websdr.org'],
    ['Sky & Telescope', 'https://skyandtelescope.org'], ['Heavens-Above', 'https://www.heavens-above.com'],
    ['EOS / Earthdata', 'https://earthdata.nasa.gov'], ['eBird', 'https://ebird.org']
  ];
  $('content').innerHTML = '<div class="panel"><h3>Научные ресурсы</h3><div class="grid">' +
    sites.map(s => '<button onclick="window.open(\'' + s[1] + '\',\'_blank\')">' + esc(s[0]) + '</button>').join('') + '</div></div>';
}

// ---------- АККАУНТ ----------
function copyId() {
  const id = account ? account.id : (Cloud.authed() ? Cloud.userId() : '');
  navigator.clipboard ? navigator.clipboard.writeText(id).then(() => toast('Скопировано')).catch(() => alert(id)) : alert(id);
}
function wallpaperPanel() {
  return '<div class="panel"><h3>🎨 Оформление</h3>' +
    '<input id="wallFile" type="file" accept="image/*" style="display:none" onchange="setWallpaper(this)">' +
    '<button onclick="document.getElementById(\'wallFile\').click()">🖼 Выбрать свой фон</button>' +
    '<button class="ghost" onclick="resetWallpaper()">Сбросить фон</button>' +
    '<p><small>Обои сжимаются и хранятся только на твоём устройстве — в облако не уходят.</small></p></div>';
}
function settings() {
  const isCloud = Cloud.authed();
  const nick = isCloud ? Cloud.nick() : (account && account.nick);
  const id = isCloud ? Cloud.userId() : (account && account.id);
  $('content').innerHTML = wallpaperPanel() +
    '<div class="panel"><h3>Профиль</h3>' +
    '<p>Ник: ' + esc(nick || '—') + '</p><p>ID: ' + esc(id || '—') + '</p>' +
    '<button onclick="copyId()">Скопировать ID</button></div>' +
    '<div class="panel"><h3>Облако</h3>' +
    '<p>' + (Cloud.configured() ? (isCloud ? '<span class="ok">Подключено: ' + esc(Cloud.nick()) + '</span>' : 'Настроено, но вход не выполнен') : '<span class="err">Не настроено (нет www/js/env.js)</span>') + '</p>' +
    (isCloud ? '<button onclick="cloudSignOut()">Выйти из облака</button>' : '<button onclick="openPage(\'auth\')">Войти / зарегистрироваться</button>') +
    (account && isCloud ? '<button onclick="pushLocalToCloud()">☁️ Перенести локальные данные в облако</button>' : '') +
    '</div>' +
    (isCloud ? '<div class="panel"><h3>👑 Код владельца</h3>' +
      '<input id="ownCode" placeholder="Код владельца" maxlength="12" autocomplete="off">' +
      '<button onclick="claimOwner()">Активировать код</button>' +
      '<small>Код выдаёт статус владельца (показывается в профиле). Сменить код можно в SQL-функции claim_owner.</small></div>' : '') +
    '<div class="panel"><h3>Опасная зона</h3>' +
    '<button class="danger" onclick="logoutLocal()">Удалить локальный профиль</button>' +
    '<button class="danger" onclick="wipeLocal()">Очистить все локальные данные</button></div>';
}
function wipeLocal() {
  if (!confirm('Удалить ВСЕ локальные данные SCIENCE OS (дневник, моды, рекорды)?')) return;
  Object.keys(localStorage).filter(k => k.startsWith('sci_') || k === 'science_os_guest_v1').forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ============================================================
// ---------- АСТРОНОМИЯ (полностью офлайн, без ключей) --------
// ============================================================

// Каталог ярких звёзд: [имя, RA (часы), Dec (градусы), звёздная величина]
const ASTRO_STARS = [
  ['Полярная', 2.53, 89.26, 1.97],
  ['Дубхе', 11.06, 61.75, 1.79], ['Мерак', 11.03, 56.38, 2.37], ['Фекда', 11.90, 53.69, 2.44],
  ['Мегрец', 12.26, 57.03, 3.31], ['Алиот', 12.90, 55.96, 1.77], ['Мицар', 13.42, 54.93, 2.23], ['Алькаид', 13.79, 49.31, 1.86],
  ['Бетельгейзе', 5.92, 7.41, 0.50], ['Ригель', 5.24, -8.20, 0.13], ['Беллатрикс', 5.42, 6.35, 1.64],
  ['Саиф', 5.80, -9.67, 2.07], ['Альнитак', 5.68, -1.94, 1.79], ['Альнилам', 5.60, -1.20, 1.69], ['Минтака', 5.53, -0.30, 2.25],
  ['Каф', 0.15, 59.15, 2.27], ['Шедар', 0.68, 56.54, 2.24], ['Гамма Cas', 0.95, 60.72, 2.47], ['Рукба', 1.43, 60.24, 2.68], ['Сегин', 1.90, 63.67, 3.35],
  ['Денеб', 20.69, 45.28, 1.25], ['Садр', 20.37, 40.26, 2.23], ['Альбирео', 19.51, 27.96, 3.05],
  ['Дельта Cyg', 19.75, 45.13, 2.86], ['Эпсилон Cyg', 20.77, 34.00, 2.48],
  ['Вега', 18.62, 38.78, 0.03], ['Шелиак', 18.77, 33.36, 3.45], ['Сулафат', 18.97, 32.69, 3.75],
  ['Альтаир', 19.85, 8.87, 0.77],
  ['Сириус', 6.75, -16.72, -1.46],
  ['Арктур', 14.26, 19.18, -0.05],
  ['Спика', 13.42, -11.16, 0.98],
  ['Кастор', 7.58, 31.88, 1.58], ['Поллукс', 7.76, 28.03, 1.14],
  ['Альдебаран', 4.60, 16.51, 0.85],
  ['Регул', 10.14, 11.97, 1.35],
  ['Антарес', 16.49, -26.43, 1.06],
  ['Процион', 7.65, 5.22, 0.34],
  ['Капелла', 5.28, 45.99, 0.08],
  ['Канопус', 6.40, -52.70, -0.74],
  ['Альфа Центавра', 14.66, -60.83, -0.27],
  ['Акрукс', 12.44, -63.10, 0.77], ['Мимоза', 12.80, -59.69, 1.25]
];
// Линии созвездий (пары индексов): Б.Ковш, Орион, Кассиопея, Лебедь, Лира, Близнецы
const ASTRO_LINES = [
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
  [8, 10], [10, 14], [14, 13], [13, 12], [12, 11], [11, 9], [9, 14],
  [15, 16], [16, 17], [17, 18], [18, 19],
  [20, 21], [21, 22], [21, 23], [21, 24],
  [25, 26], [26, 27],
  [32, 33]
];

// ---------- Фазы Луны ----------
function moonInfo(ms) {
  const SYN = 29.530588853;                      // синодический месяц, суток
  const REF = Date.UTC(2000, 0, 6, 18, 14);      // известное новолуние
  let age = ((ms - REF) / 86400000) % SYN;
  if (age < 0) age += SYN;
  const phase = age / SYN;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names = [
    ['Новолуние 🌑', 'Луна не видна — лучшее время для слабых туманностей и галактик!'],
    ['Молодая луна 🌒', 'Тонкий серп вечером на западе. Хорошо виден «пепельный свет».'],
    ['Первая четверть 🌓', 'Видна вечером. Отличные детали у терминатора (линии теней).'],
    ['Растущая луна 🌔', 'Яркая вечером и ночью. Время Лунных морей и кратеров.'],
    ['Полнолуние 🌕', 'Очень яркая — слабые объекты «съедает», зато великолепны лучи кратеров.'],
    ['Убывающая луна 🌖', 'Восходит поздно. Утренние наблюдения планет удачны.'],
    ['Последняя четверть 🌗', 'Видна под утро. Долгота дня на Луне меняется красиво.'],
    ['Старая луна 🌘', 'Тонкий серп под утро на востоке. Ищи её рядом с горизонтом.']
  ];
  const idx = Math.round(phase * 8) % 8;
  const cyclesAhead = Math.ceil((ms - REF) / 86400000 / SYN);
  const nextNew = new Date(REF + cyclesAhead * SYN * 86400000);
  const nextFull = new Date(REF + (cyclesAhead - 0.5) * SYN * 86400000);
  return { age, illum, idx, name: names[idx][0], tip: names[idx][1], nextNew, nextFull };
}
function astroMoon() {
  const m = moonInfo(Date.now());
  const f = (d, s) => d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' ' + s;
  $('astroArea').innerHTML = '<div class="panel"><h3>' + m.name + '</h3>' +
    '<div style="font-size:64px">' + ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][m.idx] + '</div>' +
    '<p>Возраст Луны: <b>' + m.age.toFixed(1) + ' дн.</b> · Освещённость: <b>' + (m.illum * 100).toFixed(0) + '%</b></p>' +
    '<p>' + esc(m.tip) + '</p>' +
    '<p>🌕 Ближайшее полнолуние: ' + f(m.nextFull, '(предварительно)') + '<br>🌑 Ближайшее новолуние: ' + f(m.nextNew, '(предварительно)') + '</p>' +
    '<small>Расчёт по синодическому месяцу 29,53 сут; точность ±1 день.</small>' +
    '<br><button class="ghost" onclick="openPage(\'diary\')">📓 Записать наблюдение</button></div>';
}

// ---------- Солнце: восход/закат ----------
function fmtHour(h) {
  while (h < 0) h += 24; while (h >= 24) h -= 24;
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return (mm === 60 ? (hh + 1) % 24 : hh).toString().padStart(2, '0') + ':' + (mm === 60 ? '00' : mm.toString().padStart(2, '0'));
}
function sunTimes(lat, lon, date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const n = Math.floor((date - start) / 86400000);
  const B = 2 * Math.PI * (n - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // мин
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365);                // градусы
  const r = Math.PI / 180;
  const cosH = (Math.cos(90.833 * r) - Math.sin(lat * r) * Math.sin(decl * r)) / (Math.cos(lat * r) * Math.cos(decl * r));
  if (cosH > 1) return { polar: 'night', decl };
  if (cosH < -1) return { polar: 'day', decl };
  const H = Math.acos(cosH) / r / 15;          // часов
  const noon = 12 - lon / 15 - eot / 60;       // местные часы (приближение по долготе)
  return { rise: noon - H, set: noon + H, noon, decl, dayLen: 2 * H };
}
function astroSun() {
  let lat = parseFloat($('astroLat') ? $('astroLat').value : store.get('sci_lat', 55.75));
  let lon = parseFloat($('astroLon') ? $('astroLon').value : store.get('sci_lon', 37.62));
  if (isNaN(lat) || isNaN(lon)) { lat = 55.75; lon = 37.62; }
  const t = sunTimes(lat, lon, new Date());
  let body;
  if (t.polar === 'night') body = '<p>❄️ Полярная ночь: Солнце не поднимается над горизонтом.</p>';
  else if (t.polar === 'day') body = '<p>☀️ Полярный день: Солнце не заходит.</p>';
  else body = '<p>🌅 Восход: <b>' + fmtHour(t.rise) + '</b> · 🌇 Закат: <b>' + fmtHour(t.set) + '</b></p>' +
    '<p>☀️ Солнечный полдень: ' + fmtHour(t.noon) + ' · Долгота дня: ' + t.dayLen.toFixed(1) + ' ч</p>';
  $('astroArea').innerHTML = '<div class="panel"><h3>☀️ Солнце сегодня</h3>' + body +
    '<p>Наклон Солнца (деклинация): ' + t.decl.toFixed(1) + '°</p>' +
    '<small>Формула упрощённая (точность ±5 мин). Время считается в часах устройства — подходит, если ты и твоя долгота в одном поясе.</small></div>';
}

// ---------- Карта звёздного неба (canvas) ----------
function localSiderealTime(date, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  let gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  if (gmst < 0) gmst += 24;
  let lst = (gmst + lon / 15) % 24;
  if (lst < 0) lst += 24;
  return lst; // часы
}
function altAz(raH, dec, lat, lon, date) {
  const r = Math.PI / 180;
  const lst = localSiderealTime(date, lon);
  let H = (lst - raH) * 15 * r; // часовой угол в рад
  const φ = lat * r, δ = dec * r;
  const sinAlt = Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAlt = Math.cos(alt);
  const sinAz = -Math.cos(δ) * Math.sin(H) / cosAlt;
  const cosAz = (Math.sin(δ) - Math.sin(φ) * sinAlt) / (Math.cos(φ) * cosAlt);
  let az = Math.atan2(sinAz, cosAz) / r;
  if (az < 0) az += 360;
  return { alt: alt / r, az };
}
function renderSky() {
  const cv = $('skyCanvas');
  if (!cv) return;
  const lat = parseFloat($('astroLat').value), lon = parseFloat($('astroLon').value);
  if (isNaN(lat) || isNaN(lon)) return alert('Введи корректные координаты');
  store.set('sci_lat', lat); store.set('sci_lon', lon);
  const date = new Date();
  const r = Math.PI / 180;
  const W = cv.width = cv.offsetWidth * 2, Hpx = cv.height = 760;
  const cx = W / 2, cy = Hpx / 2, R = Math.min(cx, cy) - 40;
  const g = cv.getContext('2d');
  g.fillStyle = '#03080f'; g.fillRect(0, 0, W, Hpx);
  // горизонт
  g.strokeStyle = '#24516c'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  // стороны света
  g.fillStyle = '#9abbd0'; g.font = '34px Arial'; g.textAlign = 'center';
  g.fillText('С', cx, cy - R - 10); g.fillText('Ю', cx, cy + R + 34);
  g.fillText('В', cx - R - 24, cy + 12); g.fillText('З', cx + R + 24, cy + 12);
  // позиции звёзд
  const pos = ASTRO_STARS.map(s => altAz(s[1], s[2], lat, lon, date));
  const xy = pos.map(p => {
    const rr = (90 - Math.max(0, p.alt)) / 90 * R;
    return { x: cx - rr * Math.sin(p.az * r), y: cy - rr * Math.cos(p.az * r), up: p.alt > 0 };
  });
  // линии созвездий
  g.strokeStyle = '#1d5a78'; g.lineWidth = 2;
  ASTRO_LINES.forEach(l => {
    const a = xy[l[0]], b = xy[l[1]];
    if (a && b && a.up && b.up) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  });
  // звёзды
  xy.forEach((p, i) => {
    if (!p.up) return;
    const mag = ASTRO_STARS[i][3];
    const size = Math.max(3, 14 - mag * 3.2);
    g.fillStyle = mag < 0.5 ? '#ffe9c4' : '#e9f7ff';
    g.beginPath(); g.arc(p.x, p.y, size, 0, Math.PI * 2); g.fill();
    if (mag <= 1.4) {
      g.fillStyle = '#9abbd0'; g.font = '26px Arial';
      g.fillText(ASTRO_STARS[i][0], p.x, p.y - 16);
    }
  });
  const lst = localSiderealTime(date, lon);
  g.fillStyle = '#51dfff'; g.font = '28px Arial';
  g.fillText('Местное звёздное время: ' + lst.toFixed(1) + ' ч', cx, Hpx - 18);
  $('skyInfo').innerHTML = '<small>Время: ' + date.toLocaleTimeString('ru-RU') + ' · широта ' + lat + '°, долгота ' + lon + '° · показаны ~40 ярчайших звёзд</small>';
  unlockAchievement('sky_chart');
}
function astroSky() {
  const lat = store.get('sci_lat', 55.75), lon = store.get('sci_lon', 37.62);
  $('astroArea').innerHTML = '<div class="panel"><h3>🌌 Карта звёздного неба</h3>' +
    '<div class="grid"><div><small>Широта (°, север +)</small><input id="astroLat" type="number" step="0.01" value="' + lat + '"></div>' +
    '<div><small>Долгота (°, восток +)</small><input id="astroLon" type="number" step="0.01" value="' + lon + '"></div></div>' +
    '<button onclick="renderSky()">🔭 Построить карту</button>' +
    '<button class="ghost" onclick="astroGeo()">📍 Определить по GPS</button>' +
    '<canvas id="skyCanvas" style="width:100%;height:auto;border-radius:12px"></canvas>' +
    '<div id="skyInfo" class="statusline"></div>' +
    '<small>Север вверху, восток слева (так, как на реальном небе). Линии — знаменитые созвездия.</small></div>';
  renderSky();
}
function astroGeo() {
  if (!navigator.geolocation) return toast('Геолокация недоступна на этом устройстве');
  toast('Определяю координаты…');
  navigator.geolocation.getCurrentPosition(
    p => {
      $('astroLat').value = p.coords.latitude.toFixed(2);
      $('astroLon').value = p.coords.longitude.toFixed(2);
      renderSky();
    },
    e => toast('GPS отказал или запрещён — введи координаты вручную'),
    { timeout: 8000 });
}

// ---------- Календарь событий 2026 ----------
const ASTRO_EVENTS = [
  ['3–4 января', '🌠 Квадрантиды', 'Пик метеорного потока, до 120 метеоров/ч. Радиант в созвездии Пастуха.'],
  ['17 февраля', '🌑 Кольцевое солнечное затмение', 'Видно в Антарктиде; частные фазы — юг Южной Америки и Африки.'],
  ['3 марта', '🌕 Полное лунное затмение', 'Видно в Азии, Австралии, Тихом океане, Северной Америке. Луна станет кроваво-красной.'],
  ['22–23 апреля', '🌠 Лириды', 'Умеренный поток от кометы Тэтчера, до 20 метеоров/ч.'],
  ['5–6 мая', '🌠 Эта Аквариды', 'Обломки кометы Галлея, до 50 метеоров/ч, лучше в южных широтах.'],
  ['12–13 августа', '🌠 Персеиды ⭐', 'Главный поток лета! До 100 метеоров/ч. В ночь пик — частное солнечное затмение днём (Гренландия, Исландия, Испания).'],
  ['28 августа', '🌕 Частное лунное затмение', 'Видно в Европе, Африке, Азии, Америке.'],
  ['21–22 октября', '🌠 Ориониды', 'Второй поток от кометы Галлея, до 25 метеоров/ч.'],
  ['17–18 ноября', '🌠 Леониды', 'Знаменитый поток, обычно до 15 метеоров/ч, раз в ~33 года — штормы.'],
  ['13–14 декабря', '🌠 Геминиды ⭐', 'Самый надёжный поток года, до 150 метеоров/ч, медленные яркие метеоры.']
];
function astroEvents() {
  $('astroArea').innerHTML = '<div class="panel"><h3>📅 Астрономический календарь 2026</h3>' +
    ASTRO_EVENTS.map(e => '<div class="panel"><b>' + e[0] + ' — ' + e[1] + '</b><p>' + esc(e[2]) + '</p></div>').join('') +
    '<small>Времена локальных пиков уточняй в разделах «Наука» (Sky & Telescope, Heavens-Above) — данные предварительные.</small></div>';
}

// ---------- Каталог объектов ----------
const ASTRO_DSO = [
  ['M45 Плеяды', 'Телец', 1.6, 'зима', 'Даже невооружённым глазом: 7 сестёр.'],
  ['M42 Туманность Ориона', 'Орион', 4.0, 'зима', 'Звёздный ясли под поясом Ориона — в бинокль потрясающе.'],
  ['M31 Андромеда', 'Андромеда', 3.4, 'осень', 'Галактика дальше 2,5 млн св. лет — самый далёкий объект для глаз.'],
  ['M13 Геркулес', 'Геркулес', 5.8, 'лето', 'Царь шаровых скоплений северного неба.'],
  ['M57 Туманность Кольцо', 'Лира', 8.8, 'лето', 'Дымное кольцо между Шелиаком и Сулафатом.'],
  ['M8 Лагуна', 'Стрелец', 6.0, 'лето', 'Светящаяся туманность низко над югом.'],
  ['M81/82', 'Б.Медведица', 7.9, 'весна', 'Пара взаимодействующих галактик.'],
  ['M44 Улей', 'Рак', 3.7, 'зима–весна', 'Рассеянное скопление, видно глазами как туманное пятнышко.'],
  ['Двойное скопление', 'Персей', 4.0, 'зима', 'Два шаровых скопления рядом — в бинокль пиршество!'],
  ['Ясли M6/M7', 'Скорпион', 4.2, 'лето', 'Кошачий глаз и Птолемеево скопление у хвоста Скорпиона.']
];
function astroCatalog() {
  $('astroArea').innerHTML = '<div class="panel"><h3>🔭 Что искать в телескоп/бинокль</h3>' +
    ASTRO_DSO.map(o => '<div class="panel"><b>' + o[0] + '</b> <small>(' + o[1] + ', зв. вел. ' + o[2] + ', сезон: ' + o[3] + ')</small><p>' + esc(o[4]) + '</p></div>').join('') +
    '<small>Звёздная величина: чем меньше, тем ярче. До 5–6 видно глазом в тёмном небе, бинокль уверенно берёт до 9.</small></div>';
}

// ---------- Страница Астрономии ----------
let astroTab = 'moon';
function astro() {
  const t = [['moon', '🌙 Луна'], ['sky', '🌌 Небо'], ['sun', '☀️ Солнце'], ['events', '📅 События'], ['catalog', '🔭 Каталог']];
  $('content').innerHTML = '<div class="panel"><div class="tabs">' +
    t.map(x => '<button class="tab ' + (astroTab === x[0] ? 'active' : '') + '" id="atab_' + x[0] + '" onclick="astroTab=\'' + x[0] + '\';astro()">' + x[1] + '</button>').join('') +
    '</div><div id="astroArea"></div></div>';
  if (astroTab === 'moon') astroMoon();
  else if (astroTab === 'sun') astroSun();
  else if (astroTab === 'events') astroEvents();
  else if (astroTab === 'catalog') astroCatalog();
  else if (astroTab === 'sky') astroSky();
}

// ============================================================
// ---------- ЗВОНКИ (WebRTC + сигнализация через Supabase) ----
// ============================================================
// Важно и честно: для пробития NAT используется только публичный
// STUN-сервер. Через мобильные сети без TURN-сервера связь может
// не установиться — тогда честно показываем "не удалось соединить".
let pc = null, localStream = null, currentCall = null;
let callPollTimer = null, signalTimer = null, modalTimer = null;
const RTC_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function callPollStart() { if (callPollTimer) return; callPollTimer = setInterval(checkIncomingCalls, 4000); checkIncomingCalls(); }
function callPollStop() { if (callPollTimer) { clearInterval(callPollTimer); callPollTimer = null; } }

function setCallText(t) { const el = $('callStatus'); if (el) el.textContent = t; }

function renderCallUi(inner) {
  const ui = $('callUi');
  ui.innerHTML = inner;
  ui.classList.remove('hidden');
}
function hideCallUi() { const ui = $('callUi'); ui.innerHTML = ''; ui.classList.add('hidden'); }

async function startCall(fid, fnick) {
  if (!netGuard().ok) return toast('Звонки работают только с облачным аккаунтом');
  if (pc || currentCall) return toast('Сначала заверши текущий звонок');
  try {
    const rows = await Cloud.rest('POST', 'calls', { caller: Cloud.userId(), callee: fid, status: 'ringing' });
    currentCall = { id: rows[0].id, peer: fid, nick: fnick, role: 'caller', lastSeen: '' };
    renderCallUi('<div class="panel callpanel"><div class="profilecard"><span class="avatar">📞</span>' +
      '<div><b>' + esc(fnick) + '</b><br><small id="callStatus">звоним… жду ответа</small></div></div>' +
      '<audio id="remoteAudio" autoplay></audio>' +
      '<button class="danger" onclick="hangUp()">📵 Отменить</button></div>');
    waitForAccept();
  } catch (e) { alert('Не удалось позвонить: ' + e.message); }
}
function waitForAccept() {
  let waited = 0;
  signalTimer = setInterval(async () => {
    if (!currentCall || currentCall.role !== 'caller') return clearInterval(signalTimer);
    waited += 2500;
    if (waited > 60000) { // не ответили за минуту
      Cloud.rest('PATCH', 'calls?id=eq.' + currentCall.id, { status: 'canceled' }).catch(() => {});
      toast('Никто не ответил');
      endCall(false);
      return;
    }
    try {
      const r = (await Cloud.rest('GET', 'calls?id=eq.' + currentCall.id + '&select=status'))[0];
      if (!r || r.status === 'declined' || r.status === 'canceled') {
        clearInterval(signalTimer);
        toast(r && r.status === 'declined' ? 'Звонок отклонён' : 'Звонок отменён');
        endCall(false);
      } else if (r.status === 'accepted') {
        clearInterval(signalTimer);
        beginCallerWebRTC();
      }
    } catch (e) { /* повторим на следующем тике */ }
  }, 2500);
}
async function beginCallerWebRTC() {
  renderCallActive('Соединяюсь…');
  try {
    await makePC();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal({ type: 'offer', sdp: offer });
    pollSignals();
  } catch (e) {
    alert('Не удалось начать звонок: ' + (e.message || 'нет доступа к микрофону'));
    endCall(true);
  }
}
function renderCallActive(text) {
  renderCallUi('<div class="panel callpanel"><div class="profilecard"><span class="avatar">🔊</span>' +
    '<div><b>' + esc(currentCall.nick) + '</b><br><small id="callStatus">' + esc(text) + '</small></div></div>' +
    '<audio id="remoteAudio" autoplay></audio>' +
    '<div class="grid"><button onclick="toggleMute()">🎤 Микрофон</button>' +
    '<button class="danger" onclick="hangUp()">📵 Завершить</button></div></div>');
}
async function makePC() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc = new RTCPeerConnection(RTC_ICE);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = e => { const a = $('remoteAudio'); if (a) a.srcObject = e.streams[0]; };
  pc.onicecandidate = e => { if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate }).catch(() => {}); };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === 'connected') setCallText('🔊 Связь установлена — говори!');
    else if (pc.connectionState === 'failed') { setCallText('❌ Не удалось соединить (нужен TURN-сервер для мобильных сетей)'); }
  };
  return pc;
}
async function sendSignal(payload) {
  if (!currentCall) return;
  return Cloud.rest('POST', 'call_signals', { call_id: currentCall.id, sender: Cloud.userId(), payload: payload });
}
function pollSignals() {
  if (signalTimer) clearInterval(signalTimer);
  signalTimer = setInterval(async () => {
    if (!currentCall) return clearInterval(signalTimer);
    try {
      const rows = await Cloud.rest('GET',
        'call_signals?call_id=eq.' + currentCall.id + '&sender=neq.' + Cloud.userId() + '&select=*&order=created_at.asc&limit=30');
      let newest = '';
      for (const s of rows) {
        if (currentCall.lastSeen && s.created_at <= currentCall.lastSeen) continue;
        newest = s.created_at;
        const p = typeof s.payload === 'string' ? JSON.parse(s.payload) : s.payload;
        if (p.type === 'offer' && !pc) {
          await makePC();
          await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          await sendSignal({ type: 'answer', sdp: ans });
        } else if (p.type === 'answer' && pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
        } else if (p.type === 'ice' && pc) {
          try { await pc.addIceCandidate(new RTCIceCandidate(p.candidate)); } catch (e2) {}
        } else if (p.type === 'bye') {
          endCall(false);
          toast('Собеседник завершил звонок');
        }
      }
      if (newest) currentCall.lastSeen = newest;
    } catch (e) { /* повторим */ }
  }, 1500);
}
async function checkIncomingCalls() {
  if (!Cloud.authed() || pc || currentCall) return;
  try {
    const rows = await Cloud.rest('GET', 'calls?callee=eq.' + Cloud.userId() + '&status=eq.ringing&select=*&order=created_at.desc&limit=1');
    if (!rows.length) return;
    const c = rows[0];
    const ppl = await fetchProfilesMap([c.caller]);
    currentCall = { id: c.id, peer: c.caller, nick: (ppl[c.caller] && ppl[c.caller].nick) || 'учёный', role: 'callee', lastSeen: '' };
    renderCallUi('<div class="panel callpanel"><div class="profilecard"><span class="avatar">📥</span>' +
      '<div><b>' + esc(currentCall.nick) + '</b><br><small id="callStatus">входящий звонок…</small></div></div>' +
      '<audio id="remoteAudio" autoplay></audio>' +
      '<div class="grid"><button onclick="acceptIncoming()">✅ Принять</button>' +
      '<button class="danger" onclick="declineIncoming()">✖ Отклонить</button></div></div>');
    clearTimeout(modalTimer);
    modalTimer = setTimeout(() => { if (currentCall && currentCall.role === 'callee' && !pc) { endCall(false); } }, 45000);
  } catch (e) { /* тишина */ }
}
async function acceptIncoming() {
  if (!currentCall) return;
  try { await Cloud.rest('PATCH', 'calls?id=eq.' + currentCall.id, { status: 'accepted' }); }
  catch (e) { alert(e.message); return; }
  clearTimeout(modalTimer);
  renderCallActive('Соединяюсь…');
  pollSignals();
}
async function declineIncoming() {
  if (!currentCall) return;
  clearTimeout(modalTimer);
  Cloud.rest('PATCH', 'calls?id=eq.' + currentCall.id, { status: 'declined' }).catch(() => {});
  currentCall = null;
  hideCallUi();
}
function toggleMute() {
  if (!localStream) return;
  const t = localStream.getAudioTracks()[0];
  t.enabled = !t.enabled;
  toast(t.enabled ? '🎤 Микрофон включён' : '🔇 Микрофон выключен');
}
async function hangUp() {
  const c = currentCall;
  if (!c) return;
  try { await Cloud.rest('PATCH', 'calls?id=eq.' + c.id, { status: 'ended' }); } catch (e) {}
  sendSignal({ type: 'bye' }).catch(() => {});
  endCall(false);
  toast('Звонок завершён');
}
function endCall(markEnded) {
  const c = currentCall;
  currentCall = null;
  clearTimeout(modalTimer);
  if (signalTimer) { clearInterval(signalTimer); signalTimer = null; }
  if (pc) { try { pc.close(); } catch (e) {} pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (c && markEnded && Cloud.authed()) Cloud.rest('PATCH', 'calls?id=eq.' + c.id, { status: 'ended' }).catch(() => {});
  hideCallUi();
}

// ---------- КОД ВЛАДЕЛЬЦА ----------
async function claimOwner() {
  const code = $('ownCode').value.trim();
  if (!code) return;
  try {
    const ok = await Cloud.rest('POST', 'rpc/claim_owner', { code: code });
    if (ok === true) { toast('👑 Код принят — ты владелец Science OS!'); $('ownCode').value = ''; settings(); }
    else toast('❌ Код не принят');
  } catch (e) { alert(e.message); }
}

// ---------- КАРТИНКИ: обработка, аватарки, фон ----------
// Читаем файл, обрезаем (если нужно до квадрата) и сжимаем в JPEG base64
function processImageFile(input, opts, cb) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type)) { alert('Это не картинка'); return; }
  const img = new Image();
  img.onload = function () {
    let sw, sh, sx, sy;
    if (opts.square) { // аватарка: центральный квадратный кроп
      const side = Math.min(img.width, img.height);
      sx = (img.width - side) / 2; sy = (img.height - side) / 2;
      sw = sh = side;
    } else { sx = 0; sy = 0; sw = img.width; sh = img.height; }
    const scale = Math.min(1, opts.maxSide / (opts.square ? sw : Math.max(sw, sh)));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * scale));
    cv.height = Math.max(1, Math.round(sh * scale));
    cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    cb(cv.toDataURL('image/jpeg', 0.85));
    input.value = '';
  };
  img.onerror = function () { alert('Не удалось прочитать картинку'); };
  img.src = URL.createObjectURL(f);
}
// Показываем аватар: фото (только валидный base64-JPEG/PNG/WebP!) или эмодзи
const AVATAR_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
function avatarHtml(p, size) {
  size = size || 44;
  const src = p && p.avatar_img && AVATAR_RE.test(p.avatar_img) ? p.avatar_img : null;
  if (src) return '<img src="' + src + '" alt="аватар" style="width:' + size + 'px;height:' + size + 'px;border-radius:12px;object-fit:cover;vertical-align:middle">';
  return '<span class="avatar" style="font-size:' + Math.round(size * 0.9) + 'px">' + esc((p && p.avatar) || '🔬') + '</span>';
}
// Фон-обои (хранятся только локально на устройстве)
function applyWallpaper() {
  const wp = store.get('sci_wallpaper', null);
  if (wp && AVATAR_RE.test(wp)) {
    document.body.style.backgroundImage = 'linear-gradient(rgba(4,12,22,.80), rgba(4,12,22,.80)), url(' + wp + ')';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundPosition = 'center';
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundAttachment = '';
    document.body.style.backgroundPosition = '';
  }
}
function setWallpaper(input) {
  processImageFile(input, { maxSide: 1600 }, d => {
    store.set('sci_wallpaper', d);
    applyWallpaper();
    toast('🖼 Фон установлен');
  });
}
function resetWallpaper() {
  store.set('sci_wallpaper', null);
  applyWallpaper();
  toast('Фон сброшен');
}
// Кастомная аватарка
function uploadAvatar(input) {
  processImageFile(input, { square: true, maxSide: 256 }, dataUrl => {
    if (account) { account.avatarImg = dataUrl; store.set('science_os_guest_v1', account); }
    if (Cloud.authed()) {
      Cloud.rest('PATCH', 'profiles?id=eq.' + Cloud.userId(), { avatar_img: dataUrl })
        .then(() => toast('📷 Аватарка сохранена в облако'))
        .catch(e => toast('Сохранено локально (облако: ' + e.message + ')'));
    } else toast('📷 Аватарка сохранена');
    if ($('pfBio') || $('pfDept')) profile(); else openPage('profile');
  });
}
function clearAvatar() {
  if (account) { delete account.avatarImg; store.set('science_os_guest_v1', account); }
  if (Cloud.authed()) Cloud.rest('PATCH', 'profiles?id=eq.' + Cloud.userId(), { avatar_img: null })
    .then(() => toast('Фото убрано')).catch(e => toast(e.message));
  profile();
}

// ============================================================
// ---------- СИМУЛЯТОР СОЛНЕЧНОЙ СИСТЕМЫ (canvas) -------------
// ============================================================
// [имя, радиус орбиты (а.е.), период (суток), цвет, радиус отрисовpx, диаметр км, факты]
const PLANETS = [
  ['Меркурий', 0.39, 88, '#b9a390', 7, 4880, 'Без атмосферы. Перепады температур: от −180 °C ночью до +430 °C днём.'],
  ['Венера', 0.72, 225, '#e8c46f', 9, 12140, 'Вращается в обратную сторону! Самая горячая планета: +465 °C, давление как на глубине 900 м.'],
  ['Земля', 1.00, 365.25, '#4f94d4', 10, 12742, 'Единственная известная планета с жизнью. 71% поверхности — вода.'],
  ['Марс', 1.52, 687, '#d1603d', 8, 6779, 'Здесь вулкан Олимп высотой 22 км — в 2,5 раза выше Эвереста. Два спутника: Фобос и Деймос.'],
  ['Юпитер', 5.20, 4333, '#d8a25c', 22, 139820, 'Гигант: вмещает 1300 Земель. Большое Красное Пятно — шторм, бушующий 300+ лет.'],
  ['Сатурн', 9.54, 10759, '#e3c98f', 19, 116460, 'Знаменитые кольца из льда и камней. Плотность меньше воды — он бы «всплыл»!'],
  ['Уран', 19.19, 30687, '#9ad5d8', 14, 50724, 'Лежит «на боку»: ось наклонена на 98°. Год длится 84 земных года.'],
  ['Нептун', 30.07, 60190, '#4666d6', 14, 49244, 'Самые быстрые ветры в Солнечной системе — до 2100 км/ч. Открыт «на кончике пера» по расчётам.']
];
const SUN_INFO = ['☀️ Солнце', 'Звезда-карлик класса G. 99,86% всей массы Солнечной системы! Внутри — 15 млн °C.', 1392700];
let solarState = { simDays: 0, speed: 5, paused: false, raf: null, last: 0, visited: {} };
const SOLAR_THETA0 = [0.3, 2.1, 4.0, 1.2, 5.1, 2.8, 0.9, 3.7]; // стартовые углы, чтобы планеты не слипались

function stopSolar() {
  if (solarState.raf) { cancelAnimationFrame(solarState.raf); solarState.raf = null; }
  solarState.last = 0;
}
function solar() {
  stopSolar();
  solarState.simDays = 0; solarState.speed = 5; solarState.paused = false; solarState.visited = {};
  $('content').innerHTML = '<div class="panel"><h3>🌞 Симулятор Солнечной системы</h3>' +
    '<p><small>Прошло: <b id="simDays">0</b> сут. (~<span id="simYears">0.00</span> лет)</small></p>' +
    '<canvas id="solarCanvas" style="width:100%;height:auto;border-radius:12px;background:#03080f;cursor:pointer"></canvas>' +
    '<div class="grid">' +
    '<button id="solarPause" onclick="solarState.paused=!solarState.paused;solarState.paused?solarPauseBtn(true):solarPauseBtn(false)">⏸ Пауза</button>' +
    '<button onclick="solarState.simDays=0;solarState.visited={};toast(\'Время сброшено\')">🔄 Сброс</button></div>' +
    '<p><small>Скорость времени: <b id="speedVal">5</b> сут/с</small></p>' +
    '<input id="solarSpeed" type="range" min="0.2" max="60" step="0.2" value="5" oninput="solarState.speed=parseFloat(this.value);$(\'speedVal\').textContent=this.value">' +
    '<small>Нажми на планету — узнаешь о ней факты! Орбиты показаны не в масштабе расстояний (сжаты по логарифму), периоды — настоящие.</small>' +
    '<div id="solarInfo"></div></div>';
  const cv = $('solarCanvas');
  cv.width = 900; cv.height = 900;
  cv.onclick = solarClick;
  solarState.raf = requestAnimationFrame(solarLoop);
}
function solarPauseBtn(paused) {
  const b = $('solarPause');
  if (b) b.textContent = paused ? '▶ Пуск' : '⏸ Пауза';
}
function solarLoop(t) {
  if (!$('solarCanvas')) { stopSolar(); return; }
  if (!solarState.last) solarState.last = t;
  const dt = Math.min(0.1, (t - solarState.last) / 1000);
  solarState.last = t;
  if (!solarState.paused) solarState.simDays += solarState.speed * dt;
  drawSolar();
  const dEl = $('simDays');
  if (dEl) {
    dEl.textContent = Math.round(solarState.simDays).toLocaleString('ru-RU');
    $('simYears').textContent = (solarState.simDays / 365.25).toFixed(2);
  }
  solarState.raf = requestAnimationFrame(solarLoop);
}
function planetPos(i, W) {
  const p = PLANETS[i];
  const cx = W / 2;
  const k = 46; // px на а.е.^0.5 → Нептун ~252 px от центра
  const r = k * Math.sqrt(p[1]);
  const th = SOLAR_THETA0[i] + 2 * Math.PI * solarState.simDays / p[2];
  return { x: cx + r * Math.cos(th), y: cx - r * Math.sin(th), r: r, rad: p[4] };
}
function drawSolar() {
  const cv = $('solarCanvas');
  if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, cx = W / 2;
  // фон-звёзды (детерминированные, чтобы не мерцали)
  g.fillStyle = '#03080f'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 140; i++) {
    const sx = ((i * 2654435761) % 1000) / 1000 * W;
    const sy = ((i * 40503) % 1000) / 1000 * W;
    g.fillStyle = i % 5 ? 'rgba(233,247,255,.35)' : 'rgba(233,247,255,.75)';
    g.fillRect(sx, sy, 2, 2);
  }
  // орбиты
  g.strokeStyle = 'rgba(50,120,155,.25)'; g.lineWidth = 1.5;
  for (let i = 0; i < PLANETS.length; i++) {
    g.beginPath(); g.arc(cx, cx, 46 * Math.sqrt(PLANETS[i][1]), 0, Math.PI * 2); g.stroke();
  }
  // Солнце со свечением
  const glow = g.createRadialGradient(cx, cx, 4, cx, cx, 60);
  glow.addColorStop(0, '#fff3b0'); glow.addColorStop(0.35, 'rgba(255,190,60,.55)'); glow.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cx, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd75e'; g.beginPath(); g.arc(cx, cx, 26, 0, Math.PI * 2); g.fill();
  // планеты
  for (let i = 0; i < PLANETS.length; i++) {
    const p = planetPos(i, W);
    g.fillStyle = PLANETS[i][3];
    g.beginPath(); g.arc(p.x, p.y, p.rad, 0, Math.PI * 2); g.fill();
    if (i === 5) { // кольца Сатурна
      g.strokeStyle = 'rgba(227,201,143,.7)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(p.x, p.y, p.rad + 9, (p.rad + 9) * 0.35, -0.5, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#9abbd0'; g.font = '22px Arial'; g.textAlign = 'center';
    g.fillText(PLANETS[i][0], p.x, p.y - p.rad - 10);
    // подсветка изученной
    if (solarState.visited[i]) {
      g.strokeStyle = '#51dfff'; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, p.rad + 6, 0, Math.PI * 2); g.stroke();
    }
  }
}
function solarClick(e) {
  const cv = $('solarCanvas');
  const rect = cv.getBoundingClientRect();
  const x = (e.clientX - rect.left) * cv.width / rect.width;
  const y = (e.clientY - rect.top) * cv.height / rect.height;
  let best = -1, bestD = 40; // радиус попадания
  for (let i = 0; i < PLANETS.length; i++) {
    const p = planetPos(i, cv.width);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  const cx = cv.width / 2;
  if (best < 0 && Math.hypot(x - cx, y - cx) < 60) { showSunInfo(); return; }
  if (best >= 0) showPlanetInfo(best);
}
function showSunInfo() {
  $('solarInfo').innerHTML = '<div class="panel"><h3>' + SUN_INFO[0] + '</h3>' +
    '<p>Диаметр: ' + SUN_INFO[2].toLocaleString('ru-RU') + ' км</p><p>' + esc(SUN_INFO[1]) + '</p></div>';
}
function showPlanetInfo(i) {
  const p = PLANETS[i];
  const years = (p[2] / 365.25).toFixed(p[2] < 1000 ? 0 : 1);
  solarState.visited[i] = true;
  $('solarInfo').innerHTML = '<div class="panel"><h3 style="color:' + p[3] + '">' + esc(p[0]) + '</h3>' +
    '<p>📏 Диаметр: ' + p[5].toLocaleString('ru-RU') + ' км · 🌍 Расстояние от Солнца: ' + p[1] + ' а.е.</p>' +
    '<p>📅 Год: ' + p[2].toLocaleString('ru-RU') + ' сут. (~' + years + ' земных)</p>' +
    '<p>' + esc(p[6]) + '</p></div>';
  if (Object.keys(solarState.visited).length >= 4) unlockAchievement('solar_tour');
}

// ============================================================
// ---------- ВИДЕОТЕКА (офлайн, файлы на устройстве) ----------
// ============================================================
function vidSize(n) { if (n > 1e9) return (n / 1e9).toFixed(2) + ' ГБ'; if (n > 1e6) return (n / 1e6).toFixed(1) + ' МБ'; return Math.round(n / 1e3) + ' КБ'; }
function videoDb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('sci_videos', 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('vids')) rq.result.createObjectStore('vids', { keyPath: 'id' }); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function videoReq(db, mode, fn) {
  return new Promise((res, rej) => {
    const rq = fn(db.transaction('vids', mode).objectStore('vids'));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
let videoUrl = null;
async function videoAdd(input) {
  const files = Array.from(input.files || []).filter(f => /^video\//.test(f.type) || /\.(mp4|webm|m4v|mov|mkv)$/i.test(f.name));
  input.value = '';
  if (!files.length) { toast('Выбери видеофайл'); return; }
  const db = await videoDb();
  for (const f of files) {
    const rec = { id: 'v' + Date.now() + '_' + Math.floor(Math.random() * 1e6), name: f.name.replace(/\.[^.]+$/, ''), size: f.size, added: Date.now(), blob: f };
    await videoReq(db, 'readwrite', st => st.put(rec));
  }
  toast('🎬 Добавлено: ' + files.length);
  videos();
}
async function videos() {
  const db = await videoDb();
  const list = (await videoReq(db, 'readonly', st => st.getAll())).sort((a, b) => b.added - a.added);
  let storage = '';
  if (navigator.storage && navigator.storage.estimate) {
    try { const e = await navigator.storage.estimate(); storage = 'Занято под приложение: ' + vidSize(e.usage || 0); } catch (err) {}
  }
  const rows = list.map(v =>
    '<div class="panel" style="padding:10px 14px"><b>🎬 ' + esc(v.name) + '</b> <small>(' + vidSize(v.size) + ')</small><br>' +
    '<button onclick="videoPlay(\'' + v.id + '\')">▶ Смотреть</button> ' +
    '<button class="ghost" onclick="videoDel(\'' + v.id + '\')">🗑 Удалить</button></div>');
  $('content').innerHTML = '<div class="panel"><h3>🎬 Офлайн-видеотека</h3>' +
    '<p><small>Добавь свои видеофайлы — они сохранятся на этом устройстве и будут доступны без интернета. Скачивай фильмы только из легальных источников (покупка в Google TV / YouTube, сервисы с офлайн-режимом).</small></p>' +
    '<input id="vidFile" type="file" accept="video/*" multiple style="display:none" onchange="videoAdd(this)">' +
    '<button onclick="document.getElementById(\'vidFile\').click()">＋ Добавить видео</button>' +
    '<p><small>Лучше всего играют mp4 и webm (avi/mkv браузер может не проиграть). ' + esc(storage) + '</small></p></div>' +
    (rows.length ? rows.join('') : '<div class="panel"><small>Пока пусто. Добавь первый фильм! 🍿</small></div>');
}
async function videoPlay(id) {
  const db = await videoDb();
  const rec = await videoReq(db, 'readonly', st => st.get(id));
  if (!rec) { toast('Видео не найдено'); return; }
  stopVideoPlayer();
  videoUrl = URL.createObjectURL(rec.blob);
  $('content').innerHTML = '<div class="panel"><h3>🎬 ' + esc(rec.name) + '</h3>' +
    '<video id="vidPlayer" src="' + videoUrl + '" controls autoplay style="width:100%;border-radius:12px;background:#000"></video>' +
    '<button onclick="videos()">← Назад к списку</button></div>';
}
function stopVideoPlayer() {
  const v = $('vidPlayer');
  if (v) { try { v.pause(); } catch (err) {} v.removeAttribute('src'); v.load(); }
  if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
}
async function videoDel(id) {
  if (!confirm('Удалить это видео с устройства?')) return;
  const db = await videoDb();
  await videoReq(db, 'readwrite', st => st.delete(id));
  stopVideoPlayer();
  toast('Удалено');
  videos();
}

// ---------- СТАРТ ----------
function init() {
  if (Cloud.handleOAuthRedirect()) { afterCloudLogin(false); } // возврат после входа через Google
  applyWallpaper(); // восстановить кастомный фон
  refreshCloudStatus();
  if (Cloud.authed()) {
    unlockAchievement('cloud_linked'); // молча: уже выдано, notify не сработает повторно
    callPollStart();
  }
  showHome();
  drawNotifBadge();
  if (Cloud.authed()) {
    Cloud.rest('GET', 'notifications?user_id=eq.' + Cloud.userId() + '&read=eq.false&select=*')
      .then(rows => { store.set('sci_notif_unread', rows.length); drawNotifBadge(); }).catch(() => {});
  }
}
init();
