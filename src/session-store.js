import session from "express-session";
import {
  getSession, setSession, deleteSession,
  purgeExpiredSessions, countSessions, flushNow
} from "./db.js";

/**
 * Хранилище сессий поверх нашего JSON-файла.
 *
 * Зачем: стандартное хранилище express-session живёт в памяти процесса, и любой
 * перезапуск сервера (в том числе `npm run dev`, который перезапускается на каждой
 * правке файла) выкидывает пользователя из аккаунта. С этим хранилищем сессия
 * переживает перезапуск, а прогресс по-прежнему привязан к GitHub-аккаунту.
 */
export class JsonSessionStore extends session.Store {
  constructor(options = {}) {
    super(options);
    const removed = purgeExpiredSessions();
    if (removed) console.log(`[session] удалено просроченных сессий: ${removed}`);
  }

  get(sid, callback) {
    try {
      callback(null, getSession(sid));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      setSession(sid, sessionData);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      deleteSession(sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  /** Продление жизни сессии при активности: обновляем только срок, не весь объект. */
  touch(sid, sessionData, callback) {
    try {
      const stored = getSession(sid);
      if (stored) {
        stored.cookie = sessionData.cookie;
        setSession(sid, stored);
      }
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  length(callback) {
    callback(null, countSessions());
  }

  /** Дописать данные на диск (например, при выключении сервера). */
  close() {
    return flushNow();
  }
}
