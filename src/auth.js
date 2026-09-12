import crypto from "node:crypto";
import express from "express";
import { config, missingConfig, configWarnings } from "./config.js";
import { upsertUser } from "./db.js";

/**
 * Настоящий OAuth 2.0 flow GitHub, написанный руками на встроенном fetch —
 * без passport и других зависимостей, чтобы было видно, что происходит.
 *
 *   1. GET /auth/github          -> редирект на github.com/login/oauth/authorize (+ случайный state)
 *   2. GitHub спрашивает у пользователя разрешение
 *   3. GET /auth/github/callback -> обмен code на access_token, чтение профиля, создание сессии
 *
 * scope=read:user — только публичный профиль, ничего больше не просим.
 */

export const authRouter = express.Router();
const SCOPE = "read:user";

/** Собирает ссылку на страницу согласия GitHub (используется и в редиректе, и в диагностике). */
function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: SCOPE,
    state,
    allow_signup: "true"
  });
  return `${config.github.oauthBaseUrl}/authorize?${params.toString()}`;
}

/** Сравнение строк без утечки по времени. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Проверка «здоровья» значений: частая причина 404 от GitHub — кавычки,
 * пробелы, перевод строки или ноль вместо буквы O, попавшие при копировании в панель хостинга.
 */
function sanityOfClientId(id) {
  const issues = [];
  if (!id) {
    issues.push("значение пустое — переменная GITHUB_CLIENT_ID не задана");
    return issues;
  }
  if (/\s/.test(id)) issues.push("внутри есть пробел или перевод строки");
  if (/["'`]/.test(id)) issues.push("внутри есть кавычки — их нужно убрать");
  if (id.length !== 20) issues.push(`длина ${id.length} символов, а у OAuth App обычно 20`);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) issues.push("есть недопустимые символы");
  if (/^0v23li/.test(id)) issues.push('начинается с нуля "0v23li" — у OAuth App там буква O');
  return issues;
}

function sanityOfCallback(url) {
  const issues = [];
  if (!url) { issues.push("пустой callback_url"); return issues; }
  if (/\s/.test(url) || /["'`]/.test(url)) issues.push("внутри есть пробелы/кавычки — уберите");
  if (!/^https?:\/\/[^/]+\//.test(url)) issues.push("не похоже на полный URL");
  if (!/\/auth\/github\/callback$/.test(url)) issues.push("не заканчивается на /auth/github/callback");
  if (/onrender\.com\/auth\/github\/callback$/.test(url) && /^https:\/\/onrender\.com\//.test(url)) {
    issues.push("указан https://onrender.com — это сайт Render, а не ваш сервис (нужен https://<имя-сервиса>.onrender.com)");
  }
  return issues;
}

let lastProbe = { at: 0, result: null };

/**
 * Живой запрос к GitHub с заведомо неверным кодом: он показывает, узнаёт ли GitHub приложение.
 * Выполняется с того сервера, где запущено приложение (то есть с Render), поэтому это
 * самая честная проверка именно вашей конфигурации. Секрет наружу не возвращается.
 */
async function probeGithubCredentials() {
  const now = Date.now();
  if (lastProbe.result && now - lastProbe.at < 60_000) return { ...lastProbe.result, cached: true };

  let status = 0;
  let data = null;
  let networkError = null;

  try {
    const response = await fetch(`${config.github.oauthBaseUrl}/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code: "a1b2c3d4e5f6a7b8c9d0"      // заведомо неверный код: проверяем только ключи
      })
    });
    status = response.status;
    data = await response.json().catch(() => null);
  } catch (err) {
    networkError = err.message;
  }

  const githubError = (data && data.error) || "";
  let verdict = "unexpected";
  if (networkError) verdict = "no_network";
  else if (githubError === "invalid_grant" || githubError === "bad_verification_code") verdict = "credentials_ok";
  else if (githubError === "incorrect_client_credentials") verdict = "client_ok_secret_wrong";
  else if (status === 404 || githubError === "Not Found") verdict = "client_id_unknown";
  else if (status === 200) verdict = "credentials_ok";   // приложение найдено, ошибка не про ключи

  const explanations = {
    credentials_ok: "Ключи верные: GitHub знает приложение и принял client_id с client_secret. " +
      "Сообщение про код (bad_verification_code / invalid_grant) — это норма: мы специально послали несуществующий код.",
    client_ok_secret_wrong: "Приложение найдено, но client_secret не подходит. Пересоздайте секрет в настройках приложения и обновите переменную на хостинге.",
    client_id_unknown: "GitHub НЕ знает такой client_id: именно это даёт 404 при входе. Скопируйте Client ID заново из настроек приложения (кнопкой Copy) и обновите переменную GITHUB_CLIENT_ID на хостинге.",
    no_network: "Сервер приложения не смог обратиться к github.com (сеть/файрвол хостинга).",
    unexpected: "Ответ GitHub не распознан, смотрите поля httpStatus и githubError."
  };

  lastProbe = {
    at: now,
    result: {
      httpStatus: status,
      githubError: githubError || null,
      githubErrorDescription: (data && data.error_description) || null,
      verdict,
      explanation: explanations[verdict],
      networkError,
      cached: false
    }
  };
  return lastProbe.result;
}

/**
 * Самодиагностика настроек: открывается без входа, чтобы можно было проверить
 * конфигурацию прямо на хостинге. Секреты не раскрываются — только факт, что они заданы.
 *
 *   GET /auth/status          — что сервер отправляет в GitHub
 *   GET /auth/status?probe=1  — плюс живая проверка ключей на стороне GitHub
 */
authRouter.get("/status", async (req, res) => {
  res.set("cache-control", "no-store");

  const payload = {
    ok: missingConfig().length === 0,
    missing: missingConfig(),
    nodeEnv: config.nodeEnv,
    clientId: config.github.clientId,
    clientIdIssues: sanityOfClientId(config.github.clientId),
    callbackUrl: config.github.callbackUrl,
    callbackUrlIssues: sanityOfCallback(config.github.callbackUrl),
    // именно эту ссылку сервер отдаёт браузеру при нажатии «Войти через GitHub»
    authorizeUrlExample: buildAuthorizeUrl("ПРИМЕР_STATE"),
    detectedPublicUrl: config.publicUrl || null,
    renderExternalUrl: process.env.RENDER_EXTERNAL_URL || null,
    secretsConfigured: {
      clientSecret: config.github.clientSecret.length > 0,
      sessionSecret: config.sessionSecret.length > 0
    },
    warnings: configWarnings(),
    hint: "callbackUrl должен посимвольно совпадать с Authorization callback URL в настройках OAuth App"
  };

  if (req.query.probe) {
    payload.githubProbe = await probeGithubCredentials();
  } else {
    payload.githubProbe = "добавьте ?probe=1, чтобы проверить ключи живым запросом к GitHub";
  }

  res.json(payload);
});

authRouter.get("/github", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  res.redirect(buildAuthorizeUrl(state));
});

authRouter.get("/github/callback", async (req, res) => {
  const fail = message => res.redirect(`/?auth_error=${encodeURIComponent(message)}`);

  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const expected = req.session.oauthState;

    // Одноразовый state — защита от CSRF на этапе входа
    delete req.session.oauthState;

    if (req.query.error) return fail(`GitHub отклонил вход: ${req.query.error}`);
    if (!code) return fail("GitHub не вернул код авторизации");
    if (!expected || !state || !safeEqual(state, expected)) {
      return fail("Проверка state не пройдена — попробуйте войти ещё раз");
    }

    // 1) Меняем временный code на access_token
    const tokenResponse = await fetch(`${config.github.oauthBaseUrl}/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: config.github.callbackUrl
      })
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));

    // GitHub отвечает понятными кодами ошибок — переводим их на человеческий
    if (!tokenResponse.ok || tokenData.error) {
      if (tokenResponse.status === 404 || tokenData.error === "Not Found") {
        throw new Error("GitHub не признал client_id (ответ 404). Скопируйте Client ID заново " +
          "из настроек OAuth App (GitHub → Settings → Developer settings → OAuth Apps) и проверьте, " +
          "что это именно OAuth App, а не GitHub App. Быстрая проверка ключей: npm run check:github");
      }
      if (tokenData.error === "incorrect_client_credentials") {
        throw new Error("Неверная пара client_id / client_secret. Проверьте первый символ client_id " +
          "(буква O, а не ноль) и при необходимости сгенерируйте новый Client secret. " +
          "Быстрая проверка ключей: npm run check:github");
      }
      if (tokenData.error === "redirect_uri_mismatch") {
        throw new Error("redirect_uri не совпадает с настройками OAuth App. В приложении должно быть " +
          "ровно: " + config.github.callbackUrl);
      }
      throw new Error(tokenData.error_description || tokenData.error ||
        `GitHub ответил ${tokenResponse.status} при обмене кода`);
    }

    if (!tokenData.access_token) {
      throw new Error("GitHub не выдал access_token");
    }

    // 2) Читаем профиль. Access token живёт только внутри этого запроса:
    //    он нам больше не нужен, поэтому ни в сессию, ни в базу не пишется.
    const profileResponse = await fetch(`${config.github.apiBaseUrl}/user`, {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`,
        accept: "application/vnd.github+json",
        "user-agent": "startup-tier-list"
      }
    });
    if (!profileResponse.ok) throw new Error(`профиль: GitHub ответил ${profileResponse.status}`);

    const profile = await profileResponse.json();
    const user = upsertUser({
      id: profile.id,
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      htmlUrl: profile.html_url
    });

    // 3) Пересоздаём сессию (защита от session fixation) и запоминаем пользователя
    req.session.regenerate(err => {
      if (err) return fail("Не удалось создать сессию");
      req.session.userId = user.id;
      req.session.save(err2 => {
        if (err2) return fail("Не удалось сохранить сессию");
        res.redirect("/");
      });
    });
  } catch (err) {
    console.error("[auth] ошибка входа:", err.message);
    fail("Вход не удался: " + err.message);
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(config.cookieName, { path: "/" });
    res.json({ ok: true });
  });
});
