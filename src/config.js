import "dotenv/config";

/**
 * Все настройки приложения в одном месте.
 * Значения берутся из переменных окружения (.env), ниже — разумные значения по умолчанию.
 */

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const port = toInt(process.env.PORT, 3000);
export const isProd = (process.env.NODE_ENV || "development") === "production";

// Значения из панели хостинга часто прилетают с хвостовыми пробелами/переводом строки
// (скопировали две строки — и всё сломается). Поэтому обрезаем их сразу.
const trimmed = value => String(value == null ? "" : value).trim();

/**
 * Встроенный Client ID приложения.
 *
 * Это НЕ секрет: client_id публичный, он виден в каждой ссылке авторизации в браузере
 * (секрет по-прежнему живёт только в переменных окружения и в git не попадает).
 * Нужен как страховка от копипаста в панели хостинга: там легко получить «0» вместо «O»,
 * и тогда GitHub отвечает 404 на клик по кнопке входа.
 */
const BUILT_IN_CLIENT_ID = "Ov23liezpWDPaOCxFGuc";

/** Отличается ли значение от встроенного только символами, которые легко спутать (0/O, 1/l/I)? */
function looksLikeTypoOfBuiltIn(candidate) {
  if (candidate.length !== BUILT_IN_CLIENT_ID.length) return false;
  let differences = 0;
  for (let i = 0; i < candidate.length; i++) {
    const a = candidate[i];
    const b = BUILT_IN_CLIENT_ID[i];
    if (a === b) continue;
    const confusable =
      ("0Oo".includes(a) && "0Oo".includes(b)) ||
      ("1lI".includes(a) && "1lI".includes(b));
    if (!confusable) return false;      // отличие не в похожих символах — значит это другое приложение
    if (++differences > 4) return false;
  }
  return differences > 0;
}

function resolveClientId() {
  const fromEnv = trimmed(process.env.GITHUB_CLIENT_ID);
  if (!fromEnv) return { value: BUILT_IN_CLIENT_ID, source: "built-in" };
  if (looksLikeTypoOfBuiltIn(fromEnv)) {
    console.warn(`[config] GITHUB_CLIENT_ID из переменных окружения ("${fromEnv}") отличается от встроенного ` +
      `только символами 0/O — использую встроенное значение ${BUILT_IN_CLIENT_ID}`);
    return { value: BUILT_IN_CLIENT_ID, source: "built-in (исправлена опечатка 0/O)" };
  }
  return { value: fromEnv, source: "env" };
}

const clientIdResolved = resolveClientId();

// Внешний адрес приложения нужен, чтобы собрать правильный callback для GitHub.
// Render сам подставляет RENDER_EXTERNAL_URL; на других хостингах задайте PUBLIC_URL.
const publicUrl = trimmed(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, "");

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  publicUrl,
  sessionSecret: trimmed(process.env.SESSION_SECRET),
  cookieName: "tierlist.sid",
  // secure-cookie: в продакшене по умолчанию только HTTPS,
  // но можно переопределить (SESSION_COOKIE_SECURE=true|false), если у хостинга нет HTTPS.
  cookieSecure: process.env.SESSION_COOKIE_SECURE
    ? trimmed(process.env.SESSION_COOKIE_SECURE) === "true"
    : isProd,
  dataFile: trimmed(process.env.DATA_FILE) || "./data/db.json",

  github: {
    clientId: clientIdResolved.value,
    clientIdSource: clientIdResolved.source,
    clientSecret: trimmed(process.env.GITHUB_CLIENT_SECRET),
    // Приоритет: явный GITHUB_CALLBACK_URL -> PUBLIC_URL/RENDER_EXTERNAL_URL -> localhost.
    // Адрес должен совпадать с "Authorization callback URL" в настройках OAuth App.
    callbackUrl: trimmed(process.env.GITHUB_CALLBACK_URL) ||
      (publicUrl
        ? `${publicUrl}/auth/github/callback`
        : `http://localhost:${port}/auth/github/callback`),
    // Базы вынесены в переменные, чтобы можно было тестировать без реального GitHub
    // и подключать GitHub Enterprise. По умолчанию — обычный GitHub.
    oauthBaseUrl: trimmed(process.env.GITHUB_OAUTH_BASE_URL || "https://github.com/login/oauth").replace(/\/+$/, ""),
    apiBaseUrl: trimmed(process.env.GITHUB_API_BASE_URL || "https://api.github.com").replace(/\/+$/, "")
  }
};

/** Каких обязательных переменных не хватает — чтобы показать понятную ошибку вместо стектрейса. */
export function missingConfig() {
  const missing = [];
  if (!config.github.clientId) missing.push("GITHUB_CLIENT_ID");
  if (!config.github.clientSecret) missing.push("GITHUB_CLIENT_SECRET");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");
  return missing;
}

/**
 * Мягкие предупреждения: сервер запустится, но настройки выглядят подозрительно
 * (заглушки из .env.example, перепутанная буква O с нулём 0 и т.п.).
 * Лучше сказать об этом сразу, чем ловить непонятную ошибку при входе.
 */
export function configWarnings() {
  const warnings = [];
  const { clientId, clientSecret } = config.github;

  if (clientSecret.length < 20 || /вставь|change|xxx+|your|placeholder|_here/i.test(clientSecret)) {
    warnings.push("GITHUB_CLIENT_SECRET похож на заглушку. Вставьте настоящий Client secret из настроек " +
      "OAuth App, иначе GitHub ответит \"incorrect_client_credentials\".");
  }

  if (clientId && !/^(Iv1\.|Ov23li|Iv23li)/.test(clientId)) {
    warnings.push(`GITHUB_CLIENT_ID "${clientId.slice(0, 6)}…" выглядит непривычно: у OAuth App он обычно ` +
      "начинается с Ov23li или Iv1. Проверьте, не перепутана ли буква O с нулём 0.");
  }

  if (config.sessionSecret.length < 16 || /super_secret|change|secret_?123/i.test(config.sessionSecret)) {
    warnings.push("SESSION_SECRET простой. Для локальной игры сойдёт, но перед выкладкой в интернет " +
      "сгенерируйте случайный: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }

  if (isProd && /localhost|127\.0\.0\.1/.test(config.github.callbackUrl)) {
    warnings.push("NODE_ENV=production, но callback ведёт на localhost (" + config.github.callbackUrl + "). " +
      "Задайте PUBLIC_URL (например, https://ваш-сервис.onrender.com) или GITHUB_CALLBACK_URL, " +
      "иначе GitHub не пустит вход. Тот же адрес добавьте в настройки OAuth App.");
  }

  return warnings;
}
