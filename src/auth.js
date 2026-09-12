import crypto from "node:crypto";
import express from "express";
import { config } from "./config.js";
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

/** Сравнение строк без утечки по времени. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

authRouter.get("/github", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: SCOPE,
    state,
    allow_signup: "true"
  });

  res.redirect(`${config.github.oauthBaseUrl}/authorize?${params.toString()}`);
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
