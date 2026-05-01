import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import http from "node:http";
import https from "node:https";

const TARGET_URL = (process.env.TARGET_URL || "").replace(/\/$/, "");
const PORT = parseInt(process.env.PORT) || 8080;   // ← مهم: از env.PORT استفاده کن

console.log(`✅ Fly Relay started on port ${PORT}`);
console.log(`Target URL: ${TARGET_URL || "NOT SET"}`);

const server = http.createServer(async (req, res) => {
  if (!TARGET_URL) {
    res.writeHead(500);
    return res.end("TARGET_URL is not set");
  }

  try {
    await new Promise(r => setTimeout(r, 5 + Math.random() * 15));

    const targetUrl = TARGET_URL + req.url;
    const isHttps = targetUrl.startsWith("https");

    const headers = {};
    const clientIp = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (["host", "connection", "upgrade", "x-fly"].includes(k)) continue;
      headers[k] = Array.isArray(value) ? value.join(", ") : value;
    }
    if (clientIp) headers["x-forwarded-for"] = clientIp;

    const fetchOpts = {
      method: req.method,
      headers,
      redirect: "manual",
      agent: isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined
    };

    if (!["GET", "HEAD"].includes(req.method)) {
      fetchOpts.body = Readable.toWeb(req);
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    res.writeHead(upstream.status || 502);

    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      try { res.setHeader(k, v); } catch {}
    }

    if (upstream.body) {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } else {
      res.end();
    }

  } catch (err) {
    console.error("Relay Error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Listening on http://0.0.0.0:${PORT}`);
});
