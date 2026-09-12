import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

/**
 * Простейшее хранилище на JSON-файле.
 *
 * Почему не SQLite: не требует нативной сборки (node-gyp/python), поэтому проект
 * ставится и запускается одной командой на любой машине. Для одного-двух
 * десятков пользователей этого более чем достаточно.
 *
 * Если позже захочется SQLite — заменить нужно только этот файл: наружу
 * торчат всего четыре функции (getUser, upsertUser, saveProgress, dropProgress).
 *
 * Запись атомарная: сначала пишем временный файл, потом переименовываем,
 * поэтому внезапное выключение не портит базу.
 */

const EMPTY_DB = { version: 1, users: {}, sessions: {} };

let cache = null;
let writeChain = Promise.resolve();
let flushTimer = null;

function readFromDisk() {
  try {
    const raw = fs.readFileSync(config.dataFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.users !== "object") return { ...EMPTY_DB };
    if (typeof parsed.sessions !== "object" || parsed.sessions === null) parsed.sessions = {};
    return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`[db] не удалось прочитать ${config.dataFile}: ${err.message}`);
    }
    return { ...EMPTY_DB };
  }
}

function db() {
  if (!cache) cache = readFromDisk();
  return cache;
}

/** Ставит запись в очередь и возвращает промис завершения. */
function flush() {
  const snapshot = JSON.stringify(db(), null, 2);
  writeChain = writeChain
    .then(async () => {
      await fsp.mkdir(path.dirname(path.resolve(config.dataFile)), { recursive: true });
      const tmp = `${config.dataFile}.tmp`;
      await fsp.writeFile(tmp, snapshot, "utf8");
      await fsp.rename(tmp, config.dataFile);
    })
    .catch(err => {
      console.error(`[db] ошибка записи в ${config.dataFile}: ${err.message}`);
    });
  return writeChain;
}

/** Только те поля, которые безопасно показывать браузеру (никаких токенов). */
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatarUrl || "",
    htmlUrl: user.htmlUrl || "",
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    hasProgress: !!user.progress
  };
}

export function getUser(id) {
  return db().users[String(id)] || null;
}

/** Создаёт или обновляет запись пользователя после успешного входа через GitHub. */
export function upsertUser({ id, login, name, avatarUrl, htmlUrl }) {
  const users = db().users;
  const key = String(id);
  const now = new Date().toISOString();
  const user = users[key] || { id: key, createdAt: now };

  user.login = login;
  user.name = name || login;
  user.avatarUrl = avatarUrl || "";
  user.htmlUrl = htmlUrl || "";
  user.lastLoginAt = now;
  if (!("progress" in user)) user.progress = null;

  users[key] = user;
  flush();
  return user;
}

/** Сохраняет прогресс (полное состояние тир-листа) конкретного пользователя. */
export function saveProgress(userId, progress) {
  const user = getUser(userId);
  if (!user) return null;
  user.progress = progress;
  flush();
  return user.progress;
}

/** Стирает прогресс — «Сбросить всё». */
export function dropProgress(userId) {
  const user = getUser(userId);
  if (!user) return null;
  user.progress = null;
  flush();
  return null;
}

/** Дождаться, пока все записи долетят на диск (используется в аккуратном завершении и тестах). */
export function flushNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  return flush();
}

/* ==================================================================== *
 *  Сессии
 *
 *  express-session по умолчанию хранит сессии в памяти процесса — тогда
 *  после каждого перезапуска сервера (в том числе в `npm run dev`)
 *  пользователя выкидывает из аккаунта. Поэтому храним их здесь же,
 *  в том же JSON-файле: перезапуск сессию больше не убивает.
 * ==================================================================== */

/** Отложенная запись: сессии дёргаются на каждый запрос, писать каждый раз незачем. */
export function scheduleFlush(delay = 400) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, delay);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

function sessions() {
  const data = db();
  if (!data.sessions || typeof data.sessions !== "object") data.sessions = {};
  return data.sessions;
}

export function getSession(sid) {
  return sessions()[sid] || null;
}

export function setSession(sid, sessionData) {
  sessions()[sid] = sessionData;
  scheduleFlush();
}

export function deleteSession(sid) {
  if (sid && sessions()[sid]) {
    delete sessions()[sid];
    scheduleFlush();
  }
}

export function countSessions() {
  return Object.keys(sessions()).length;
}

/** Выкидываем просроченные сессии, чтобы файл не пух. */
export function purgeExpiredSessions() {
  const all = sessions();
  const now = Date.now();
  let removed = 0;
  for (const [sid, sess] of Object.entries(all)) {
    const expires = sess && sess.cookie && sess.cookie.expires;
    if (expires && new Date(expires).getTime() < now) {
      delete all[sid];
      removed++;
    }
  }
  if (removed) scheduleFlush(0);
  return removed;
}

