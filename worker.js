export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        "SCIENCE OS — сервер работает! 🚀",
        {
          headers: {
            "Content-Type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    return new Response("Not found", { status: 404 });
  }
};
