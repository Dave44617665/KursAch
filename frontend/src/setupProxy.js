const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Проксируем API запросы к Go backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
    })
  );

  // Проксируем WebSocket соединения к Go backend
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      ws: true, // включаем поддержку WebSocket
      changeOrigin: true,
      logLevel: 'debug',
    })
  );
};