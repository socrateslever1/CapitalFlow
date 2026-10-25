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
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === "production";
  const httpServer = http.createServer(app);

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
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

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/infinitepay/checkout", async (req, res) => {
    try {
      const {
        handle,
        amount,
        loan_id,
        installment_id,
        payer_name,
        payer_email,
        payer_phone,
        return_url,
      } = req.body || {};

      let cleanHandle = String(handle || "").trim().replace(/^[@$]+/, "");

      if (!cleanHandle) {
        cleanHandle = String(process.env.INFINITEPAY_HANDLE || "").trim().replace(/^[@$]+/, "");
      }

      if (!cleanHandle) {
        return res.status(400).json({
          ok: false,
          error: "InfiniteTag não informada. Configure sua InfiniteTag (ex: socrateslever).",
        });
      }

      const numAmount = Number(amount || 0);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return res.status(400).json({ ok: false, error: "Valor inválido para cobrança." });
      }

      const orderNsu = "cf_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
      const redirectUrl = String(
        return_url || (req.headers.referer ? String(req.headers.referer) : "https://capitalflow.app")
      );

      const checkoutPayload: Record<string, unknown> = {
        handle: cleanHandle,
        redirect_url: redirectUrl,
        order_nsu: orderNsu,
        items: [
          {
            quantity: 1,
            price: Math.round(numAmount * 100),
            description: `Parcela - Contrato ${String(loan_id || "").slice(0, 8)}`,
          },
        ],
      };

      const customerName = String(payer_name || "").trim();
      const customerEmail = String(payer_email || "").trim();
      const customerPhone = String(payer_phone || "").trim();

      if (customerName || customerEmail || customerPhone) {
        checkoutPayload.customer = {
          name: customerName || "Cliente",
          email: customerEmail || "cliente@capitalflow.app",
          phone_number: customerPhone || undefined,
        };
      }

      const providerRes = await fetch("https://api.checkout.infinitepay.io/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutPayload),
      });

      const providerData: any = await providerRes.json().catch(() => null);

      if (!providerRes.ok || !providerData?.url) {
        const errorMsg =
          providerData?.message || providerData?.error || "Erro ao gerar checkout na InfinitePay.";
        return res.status(400).json({ ok: false, error: errorMsg, details: providerData });
      }

      return res.json({
        ok: true,
        checkout_url: providerData.url,
        external_reference: orderNsu,
      });
    } catch (err: any) {
      console.error("[InfinitePay API Error]:", err);
      return res.status(500).json({ ok: false, error: err?.message || "Erro interno no servidor." });
    }
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

  let currentPort = PORT;
  const startListen = (port: number) => {
    currentPort = port;
    httpServer.listen(port, "0.0.0.0", () => {
      const ips = getNetworkIps();
      console.log(`\n======================================================`);
      console.log(`🚀 CapitalFlow Server rodando em modo ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
      console.log(`------------------------------------------------------`);
      console.log(`➜ Local:            http://localhost:${port}`);
      if (ips.length > 0) {
        ips.forEach((ip) => {
          console.log(`➜ Rede (Wi-Fi/LAN):  http://${ip}:${port}`);
        });
      }
      console.log(`------------------------------------------------------`);
      console.log(`🌐 Para acesso externo via Internet:`);
      console.log(`   Execute em outro terminal: npm run dev:tunnel -- --port ${port}`);
      console.log(`======================================================\n`);
    });
  };

  httpServer.on("error", (err: any) => {
    if ((err.code === "EACCES" || err.code === "EADDRINUSE") && !process.env.PORT && currentPort < 3010) {
      const nextPort = currentPort + 1;
      console.warn(`⚠️ Porta ${currentPort} ocupada ou sem permissão (${err.code}). Tentando porta ${nextPort}...`);
      startListen(nextPort);
      return;
    }
    throw err;
  });

  startListen(PORT);
}

startServer();
