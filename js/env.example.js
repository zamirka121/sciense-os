/* SCIENCE OS — конфигурация облака.
   Скопируйте этот файл в www/js/env.js (он в .gitignore и не попадёт в репозиторий)
   и вставьте значения из вашего проекта Supabase:
   Dashboard → Project Settings → API.
   ВАЖНО: только URL проекта и анонимный (anon public) ключ!
   service_role и любые секретные ключи сюда класть запрещено. */
window.SCIENCE_OS_ENV = {
  supabaseUrl: 'https://ВАШ-ПРОЕКТ.supabase.co',
  supabaseAnonKey: 'ВАШ-АНОНИМНЫЙ-КЛЮЧ'
};
