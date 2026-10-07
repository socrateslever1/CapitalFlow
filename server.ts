import express from "express";
import { createServer as createViteServer } from "vite";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const ifaceList of Object.values(interfaces)) {
    for (const iface of ifaceList || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3003;
  const isProduction = process.env.NODE_ENV === "production";
  const httpServer = http.createServer(app);

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'self'",
          "script-src 'self' 'unsafe-inline' https://accounts.google.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https: wss:",
          "frame-src 'self' https://accounts.google.com https://checkout.infinitepay.io",
          "media-src 'self' blob:",
          "worker-src 'self' blob:",
          "form-action 'self' https://checkout.infinitepay.io",
        ].join("; ")
      );
    }

    next();
  });

  // API routes FIRST
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (!isProduction) {
    app.use((_req, res, next) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      next();
    });

    app.get("/service-worker.js", (_req, res) => {
      res.type("application/javascript").send(`
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
`);
    });

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        hmr: {
          server: httpServer,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving
    app.use(express.static(path.resolve(__dirname, "dist")));

    // SPA fallback for production
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    const ips = getNetworkIps();
    console.log(`\n======================================================`);
    console.log(`🚀 CapitalFlow Server rodando em modo ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
    console.log(`------------------------------------------------------`);
    console.log(`➜ Local:            http://localhost:${PORT}`);
    if (ips.length > 0) {
      ips.forEach((ip) => {
        console.log(`➜ Rede (Wi-Fi/LAN):  http://${ip}:${PORT}`);
      });
    }
    console.log(`------------------------------------------------------`);
    console.log(`🌐 Para acesso externo via Internet:`);
    console.log(`   Execute em outro terminal: npm run dev:tunnel`);
    console.log(`======================================================\n`);
  });
}

startServer();
