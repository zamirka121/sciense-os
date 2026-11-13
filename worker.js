export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("SCIENCE OS ONLINE 🚀");
    }

    if (url.pathname === "/db-test") {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `).run();

        return new Response("D1 DATABASE CONNECTED!");
      } catch (error) {
        return new Response("DATABASE ERROR: " + error.message, {
          status: 500
        });
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
