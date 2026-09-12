import express from "express";
import { companies, TIERS, TIER_KEYS, COMPANY_NAME_SET } from "./data/companies.js";
import { getUser, publicUser, saveProgress } from "./db.js";

/**
 * JSON API приложения. Все ручки, кроме ничего, требуют активной сессии:
 * без входа браузер получает 401, а фронтенд показывает экран «Войти через GitHub».
 */

export const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  res.set("cache-control", "no-store");
  next();
});

function requireAuth(req, res, next) {
  const user = req.session.userId ? getUser(req.session.userId) : null;
  if (!user) return res.status(401).json({ error: "unauthorized", message: "Нужно войти через GitHub" });
  req.user = user;
  next();
}

/** Проверка тела запроса прогресса. Всё, что приходит из браузера, считается недоверенным. */
function validateProgress(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Ожидается объект состояния" };
  }

  const assignments = body.assignments;
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
    return { error: "Поле assignments должно быть объектом" };
  }
  const cleanAssignments = {};
  for (const [name, tier] of Object.entries(assignments)) {
    if (!COMPANY_NAME_SET.has(name)) return { error: `Неизвестная компания: ${name}` };
    if (!TIER_KEYS.includes(tier)) return { error: `Неизвестный тир: ${tier}` };
    cleanAssignments[name] = tier;
  }
  if (Object.keys(cleanAssignments).length > companies.length) {
    return { error: "Слишком много распределённых компаний" };
  }

  if (!Array.isArray(body.queue)) return { error: "Поле queue должно быть массивом" };
  if (body.queue.length > companies.length) return { error: "Очередь длиннее списка компаний" };
  const queue = [];
  const queueSet = new Set();
  for (const name of body.queue) {
    if (typeof name !== "string" || !COMPANY_NAME_SET.has(name)) return { error: `В очереди неизвестная компания: ${name}` };
    if (queueSet.has(name)) return { error: `Компания повторяется в очереди: ${name}` };
    queueSet.add(name);
    queue.push(name);
  }

  const current = body.current == null ? null : String(body.current);
  if (current !== null && !COMPANY_NAME_SET.has(current)) {
    return { error: `Неизвестная текущая компания: ${current}` };
  }

  const seen = new Set([...queue, ...Object.keys(cleanAssignments)]);
  if (current !== null) {
    if (seen.has(current)) return { error: `Компания дублируется: ${current}` };
    seen.add(current);
  }
  if (seen.size > companies.length) return { error: "Компаний больше, чем есть в списке" };

  const done = !!body.done;
  if (done && (current !== null || queue.length > 0)) {
    return { error: "Игра помечена завершённой, но остались нераспределённые компании" };
  }
  if (!done && current === null) {
    return { error: "Игра не завершена, но текущая компания не выбрана" };
  }

  return {
    progress: {
      queue,
      current,
      assignments: cleanAssignments,
      done,
      updatedAt: new Date().toISOString()
    }
  };
}

// Текущий пользователь: по этой ручке фронтенд понимает, вошёл он или нет
apiRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Справочники: список компаний и тиры (фронтенд ничего не хардкодит)
apiRouter.get("/companies", requireAuth, (req, res) => {
  res.json({ companies, tiers: TIERS });
});

// Прогресс пользователя (null — если он ещё ничего не начал)
apiRouter.get("/progress", requireAuth, (req, res) => {
  res.json({ progress: req.user.progress || null });
});

// Сохранение прогресса: сюда летит состояние после каждого действия.
// «Сбросить всё» — это тоже PUT, но со свежим перемешанным состоянием.
apiRouter.put("/progress", requireAuth, (req, res) => {
  const { progress, error } = validateProgress(req.body);
  if (error) return res.status(400).json({ error: "invalid_progress", message: error });

  const saved = saveProgress(req.user.id, progress);
  res.json({ ok: true, progress: saved, user: publicUser(req.user) });
});

apiRouter.use((req, res) => {
  res.status(404).json({ error: "not_found", message: "Нет такой ручки" });
});
