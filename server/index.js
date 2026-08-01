export default {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response('LZY static assets are unavailable.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
