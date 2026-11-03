const { getDefaultConfig } = require('expo/metro-config');
const http = require('node:http');
const config = getDefaultConfig(__dirname);
const previousEnhancer = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const nextMiddleware = previousEnhancer ? previousEnhancer(middleware, server) : middleware;
  return (request, response, next) => {
    // Optional development-only proxy: Expo and the authenticated API share one tunnel.
    const target = process.env.MONIMOB_DEV_API_ORIGIN;
    if (!target || (!request.url.startsWith('/api/') && request.url !== '/health')) return nextMiddleware(request, response, next);
    const upstream = http.request(new URL(request.url, target), { method: request.method, headers: { ...request.headers, host: new URL(target).host } }, result => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'API de desenvolvimento indisponível.' })); });
    request.pipe(upstream);
  };
};
module.exports = config;
