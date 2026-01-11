const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
    // API proxy
    app.use(
        "/api",
        createProxyMiddleware({
            target: "http://81.30.105.33:8080",
            changeOrigin: true,
            secure: false,
            logLevel: "debug",
            onProxyReq: (proxyReq, req, res) => {
                if (!proxyReq.getHeader("origin")) {
                    proxyReq.setHeader("origin", "http://localhost:3000");
                }
                console.log("[API Proxy]", req.method, req.path);
            },
            onError: (err, req, res) => {
                console.error("[API Proxy Error]", err);
            },
        }),
    );

    // WebSocket proxy
    app.use(
        "/ws",
        createProxyMiddleware({
            target: "http://81.30.105.33:8080",
            ws: true,
            changeOrigin: true,
            logLevel: "debug",
            onProxyReq: (proxyReq, req, res) => {
                console.log("[WS Proxy] Upgrading:", req.path);
            },
            onProxyReqWs: (proxyReq, req, socket, options, head) => {
                console.log("[WS Proxy] WebSocket upgrade for:", req.url);
            },
            onError: (err, req, res) => {
                console.error("[WS Proxy Error]", err.message);
            },
            onOpen: (proxySocket) => {
                console.log("[WS Proxy] WebSocket connection opened");
            },
            onClose: (res, socket, head) => {
                console.log("[WS Proxy] WebSocket connection closed");
            },
        }),
    );
};
