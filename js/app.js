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
