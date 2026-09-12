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

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  sessionSecret: process.env.SESSION_SECRET || "",
  cookieName: "tierlist.sid",
  dataFile: process.env.DATA_FILE || "./data/db.json",

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    // По умолчанию callback собирается из PORT — если поменяете порт, адрес
    // подстроится сам (и его же нужно указать в настройках OAuth App).
    callbackUrl: process.env.GITHUB_CALLBACK_URL || `http://localhost:${port}/auth/github/callback`,
    // Базы вынесены в переменные, чтобы можно было тестировать без реального GitHub
    // и подключать GitHub Enterprise. По умолчанию — обычный GitHub.
    oauthBaseUrl: (process.env.GITHUB_OAUTH_BASE_URL || "https://github.com/login/oauth").replace(/\/+$/, ""),
    apiBaseUrl: (process.env.GITHUB_API_BASE_URL || "https://api.github.com").replace(/\/+$/, "")
  }
};

export const isProd = config.nodeEnv === "production";

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

  return warnings;
}
