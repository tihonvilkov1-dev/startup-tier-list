import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import { config, isProd, missingConfig, configWarnings } from "./src/config.js";
import { authRouter } from "./src/auth.js";
import { apiRouter } from "./src/api.js";
import { flushNow } from "./src/db.js";
import { JsonSessionStore } from "./src/session-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

/* ---------------------------------------------------------------- *
 *  Проверка настроек: понятное сообщение вместо стектрейса
 * ---------------------------------------------------------------- */
const missing = missingConfig();
if (missing.length) {
  console.error("\n  Не хватает переменных окружения: " + missing.join(", "));
  console.error("\n  Что сделать:");
  console.error("    1) cp .env.example .env");
  console.error("    2) Создайте OAuth App: https://github.com/settings/applications/new");
  console.error("       Homepage URL:              http://localhost:" + config.port);
  console.error("       Authorization callback URL: " + config.github.callbackUrl);
  console.error("    3) Вставьте Client ID и Client secret в .env,");
  console.error("       а SESSION_SECRET сгенерируйте командой:");
  console.error('       node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error("    4) npm start\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- *
 *  Приложение
 * ---------------------------------------------------------------- */
const app = express();
app.disable("x-powered-by");

// За прокси/HTTPS (например, при деплое) — чтобы cookie с secure работали
if (isProd) app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));

app.use(session({
  name: config.cookieName,
  secret: config.sessionSecret,
  store: new JsonSessionStore(),   // сессии переживают перезапуск сервера (см. src/session-store.js)
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // cookie недоступна из JS — токен сессии не украсть через XSS
    sameSite: "lax",         // плюс проверка Origin ниже — этого хватает от CSRF
    secure: config.cookieSecure,   // в продакшене HTTPS (переопределяется SESSION_COOKIE_SECURE)
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

// Простейшая защита от кросс-сайтовых изменяющих запросов
app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();               // curl/тесты браузера без Origin
  try {
    if (new URL(origin).host !== req.get("host")) {
      return res.status(403).json({ error: "cross_origin", message: "Запрос с другого источника" });
    }
  } catch {
    return res.status(403).json({ error: "bad_origin", message: "Некорректный Origin" });
  }
  next();
});

app.get("/healthz", (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use("/auth", authRouter);
app.use("/api", apiRouter);

// Статика: index.html, styles.css, app.js
app.use(express.static(publicDir, { index: "index.html", extensions: ["html"] }));

app.use((req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
    return res.status(404).json({ error: "not_found", message: "Нет такой ручки" });
  }
  // root обязателен: иначе sendFile считает точкой в пути скрытую папку
  // (например, ~/.cline/...) и отвечает 404 вместо отдачи файла.
  res.status(404).sendFile("404.html", { root: publicDir });
});

app.use((err, req, res, next) => {
  console.error("[server] ошибка:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "server_error", message: "Внутренняя ошибка сервера" });
});

/* ---------------------------------------------------------------- *
 *  Запуск
 * ---------------------------------------------------------------- */
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log("\n  Тир-лист стартапов запущен");
  console.log("  ------------------------------------------------");
  console.log(`  Откройте в браузере:  ${config.publicUrl || "http://localhost:" + config.port}`);
  if (config.publicUrl) console.log(`  Локально:            http://localhost:${config.port}`);
  console.log(`  Callback URL для GitHub OAuth App:`);
  console.log(`  ${config.github.callbackUrl}`);
  console.log(`  client_id: ${config.github.clientId || "(не задан!)"}`);
  console.log(`  Проверка настроек на хостинге: ${(config.publicUrl || "http://localhost:" + config.port)}/auth/status`);
  console.log(`  Данные: ${path.resolve(config.dataFile)}`);
  console.log(`  Режим:  ${config.nodeEnv}`);
  console.log("  ------------------------------------------------");

  const warnings = configWarnings();
  if (warnings.length) {
    console.log("  Предупреждения по настройкам:");
    warnings.forEach(warning => console.log("   ⚠ " + warning));
    console.log("  ------------------------------------------------");
  }
  console.log("");
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Порт ${config.port} уже занят.`);
    console.error("  Либо закройте прошлый запуск, либо укажите другой порт в .env: PORT=3001\n");
    process.exit(1);
  }
  throw err;
});

async function shutdown(signal) {
  console.log(`\n  ${signal}: сохраняю данные и выключаюсь...`);
  server.close(async () => {
    await flushNow();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
