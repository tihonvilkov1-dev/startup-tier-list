/**
 * Проверка ключей GitHub OAuth из .env — без браузера и без выдачи каких-либо прав.
 *
 * Отправляем на github.com заведомо неверный, но правдоподобный code (20 hex-символов):
 *   invalid_grant                 -> client_id и client_secret верные, можно входить в браузере;
 *   incorrect_client_credentials  -> неверная пара client_id/client_secret;
 *   404 Not Found                 -> GitHub не знает такой client_id.
 *
 * Ничего не создаёт и не меняет: OAuth-код не выдаётся, доступы не запрашиваются.
 *
 * Запуск: npm run check:github   (из корня проекта, чтобы подхватился .env)
 */
import { config } from "../src/config.js";

const clientId = config.github.clientId;
const clientSecret = config.github.clientSecret;

if (!clientId || !clientSecret) {
  console.log("✖ В .env нет GITHUB_CLIENT_ID или GITHUB_CLIENT_SECRET");
  process.exit(1);
}

console.log("client_id:      " + clientId);
console.log("client_secret:  " + clientSecret.length + " символов (значение не показываю)");
console.log("endpoint:       " + config.github.oauthBaseUrl + "/access_token");
console.log("");

const payload = {
  client_id: clientId,
  client_secret: clientSecret,
  code: "a1b2c3d4e5f6a7b8c9d0"      // неверный код: нужен только для проверки ключей
};

let status = 0;
let data = null;

try {
  const response = await fetch(`${config.github.oauthBaseUrl}/access_token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  status = response.status;
  data = await response.json().catch(() => null);
  console.log("ответ GitHub: HTTP " + status + " -> " + JSON.stringify(data));
} catch (err) {
  console.log("✖ Сеть: " + err.message);
  console.log("\nПроверьте подключение к интернету / прокси.");
  process.exit(1);
}

const error = (data && data.error) || "";
console.log("");

if (error === "invalid_grant") {
  console.log("✔ Ключи ВЕРНЫЕ: client_id и client_secret приняты GitHub. Можно входить через браузер.");
} else if (error === "incorrect_client_credentials") {
  console.log("✖ Ключи НЕВЕРНЫЕ.");
  console.log("  1) Проверьте первый символ client_id: у OAuth App это буква O, а не цифра 0.");
  console.log("  2) Сгенерируйте новый Client secret в настройках OAuth App.");
  console.log("  3) Убедитесь, что client_id и secret взяты из ОДНОГО приложения.");
  process.exitCode = 1;
} else if (status === 404) {
  console.log("✖ GitHub не знает такой client_id (ответ 404).");
  console.log("  1) Скопируйте Client ID заново из настроек OAuth App (кнопка Copy, не перепечатывайте руками).");
  console.log("  2) Проверьте, что создано именно OAuth App, а не GitHub App");
  console.log("     (нужен раздел Settings → Developer settings → OAuth Apps).");
  console.log("  3) Если приложение удаляли — создайте новое и обновите .env.");
  process.exitCode = 1;
} else {
  console.log("? Неожиданный ответ, смотрите текст выше.");
  process.exitCode = 1;
}
