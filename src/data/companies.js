/**
 * Список стартапов для тир-листа — единственный источник правды.
 * Фронтенд получает его через GET /api/companies.
 */
export const companies = [
  {"name":"OpenAI","sector":"AI/LLM","desc":"Разработчик GPT и ChatGPT"},
  {"name":"Anthropic","sector":"AI/LLM","desc":"Разработчик модели Claude"},
  {"name":"SpaceX","sector":"Aerospace","desc":"Ракеты, спутники Starlink"},
  {"name":"xAI","sector":"AI/LLM","desc":"Разработчик модели Grok"},
  {"name":"ByteDance","sector":"Consumer/AI","desc":"Материнская компания TikTok"},
  {"name":"Stripe","sector":"Fintech","desc":"Платёжная инфраструктура для бизнеса"},
  {"name":"Waymo","sector":"Robotics","desc":"Автономные робо-такси"},
  {"name":"Databricks","sector":"Data/AI","desc":"Платформа Data+AI (Lakehouse)"},
  {"name":"Scale AI","sector":"AI Data","desc":"Разметка данных для обучения AI"},
  {"name":"Anduril","sector":"Defense","desc":"Автономные оборонные системы"},
  {"name":"Binance","sector":"Crypto","desc":"Крупнейшая криптобиржа"},
  {"name":"Revolut","sector":"Fintech","desc":"Мультивалютные счета и карты"},
  {"name":"DeepSeek","sector":"AI/LLM","desc":"Открытые LLM модели"}
];

/** Допустимые тиры: S — лучший, F — худший. */
export const TIERS = [
  { key: "S", label: "Супер",               color: "#e8664f" },
  { key: "A", label: "Отлично",             color: "#e8a15c" },
  { key: "B", label: "Хорошо",              color: "#f0e77e" },
  { key: "C", label: "Удовлетворительно",   color: "#a3d977" },
  { key: "D", label: "Неудовлетворительно", color: "#8fd3e8" },
  { key: "E", label: "Крайне плохо",        color: "#8f93e8" },
  { key: "F", label: "Полный провал",       color: "#e08fe0" }
];

export const TIER_KEYS = TIERS.map(t => t.key);
export const COMPANY_NAMES = companies.map(c => c.name);
export const COMPANY_NAME_SET = new Set(COMPANY_NAMES);
