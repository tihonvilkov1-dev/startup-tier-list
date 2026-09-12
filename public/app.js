"use strict";

/* ==========================================================================
   Тир-лист стартапов — клиентская логика.

   Источник правды по прогрессу — сервер: после каждого действия браузер
   отправляет PUT /api/progress, поэтому обновление страницы, закрытие
   вкладки или вход с другого устройства ничего не теряют.
   ========================================================================== */

const el = id => document.getElementById(id);

const dom = {
  loadingView: el("loadingView"),
  loginView: el("loginView"),
  gameView: el("gameView"),
  authError: el("authError"),
  userBox: el("userBox"),
  userAvatar: el("userAvatar"),
  userNick: el("userNick"),
  saveState: el("saveState"),
  tierList: el("tierList"),
  progressText: el("progressText"),
  progressBar: el("progressBar"),
  cardArea: el("cardArea"),
  card: el("card"),
  cardName: el("cardName"),
  cardSector: el("cardSector"),
  cardDesc: el("cardDesc"),
  grip: el("grip"),
  tierButtons: el("tierButtons"),
  doneBox: el("doneBox"),
  doneHint: el("doneHint"),
  btnRestart: el("btnRestart"),
  btnSkip: el("btnSkip"),
  btnUndo: el("btnUndo"),
  btnReset: el("btnReset"),
  btnLogout: el("btnLogout"),
  flash: el("flash"),
  chipMenu: el("chipMenu")
};

/* Справочники, которые приходят с сервера (фронтенд их не дублирует) */
let companies = [];
let companyByName = new Map();
let tiers = [];
let tierByKey = new Map();

/* Пользователь и его прогресс */
let user = null;
let state = null;        // { queue: [], current: "Имя" | null, assignments: {}, done: bool }
let historyStack = [];   // отмена — в памяти вкладки; на сервере хранится только текущее состояние

/* Служебные переменные */
let flashTimer = null;
let saveChain = Promise.resolve();
let dragName = null;     // кого тащим мышью
let dragSource = null;   // "card" — карточку, "chip" — чип из тира
let ghost = null;        // «призрак» карточки при перетаскивании пальцем
let touchName = null;

/* ==================== мелкие утилиты ==================== */

// Перемешивание Фишера–Йетса — порядок показа компаний случайный
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function flash(text) {
  dom.flash.textContent = text;
  dom.flash.classList.add("is-on");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => dom.flash.classList.remove("is-on"), 2400);
}

// Индикатор в шапке: сохраняю… / сохранено / ошибка сохранения
function setSaveState(kind, message) {
  const node = dom.saveState;
  if (!node) return;
  node.classList.remove("is-saving", "is-saved", "is-error");
  node.removeAttribute("title");
  if (kind === "saving") {
    node.classList.add("is-saving");
    node.textContent = "сохраняю…";
  } else if (kind === "saved") {
    node.classList.add("is-saved");
    node.textContent = "сохранено";
  } else if (kind === "error") {
    node.classList.add("is-error");
    node.textContent = "не сохранилось";
    node.title = message || "";
  } else {
    node.textContent = "";
  }
}

/* ==================== общение с сервером ==================== */

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let data = null;
  try { data = await response.json(); } catch { /* пустой или не-JSON ответ */ }

  if (!response.ok) {
    const err = new Error((data && data.message) || `Сервер ответил ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data || {};
}

/**
 * Сохраняет текущее состояние на сервере.
 * Запросы выстраиваются в цепочку, поэтому два быстрых действия
 * не перезапишут друг друга по порядку.
 */
function saveProgress() {
  if (!state) return saveChain;

  const payload = {
    queue: state.queue,
    current: state.current,
    assignments: state.assignments,
    done: state.done
  };

  setSaveState("saving");
  saveChain = saveChain
    .then(() => api("/api/progress", { method: "PUT", body: payload }))
    .then(() => setSaveState("saved"))
    .catch(err => {
      if (err.status === 401) { handleSessionLost(); return; }
      console.error("[app] не удалось сохранить прогресс:", err.message);
      setSaveState("error", err.message);
      flash("Не сохранилось: " + err.message);
    });

  return saveChain;
}

function handleSessionLost() {
  user = null;
  state = null;
  showLogin("Сессия истекла — войдите заново");
}

/* ==================== экраны ==================== */

function showView(name) {
  dom.loadingView.hidden = name !== "loading";
  dom.loginView.hidden = name !== "login";
  dom.gameView.hidden = name !== "game";
  dom.userBox.hidden = name !== "game";
}

function showLogin(message) {
  showView("login");
  if (message) {
    dom.authError.textContent = message;
    dom.authError.hidden = false;
  }
}

function renderUser() {
  dom.userNick.textContent = user ? (user.name || user.login) : "—";
  if (user && user.avatarUrl) {
    dom.userAvatar.src = user.avatarUrl;
    dom.userAvatar.hidden = false;
  } else {
    dom.userAvatar.removeAttribute("src");
    dom.userAvatar.hidden = true;
  }
  dom.userAvatar.alt = user ? "Аватар " + user.login : "";
  dom.userAvatar.title = user ? "@" + user.login : "";
}

/* ==================== старт приложения ==================== */

function showAuthErrorFromUrl() {
  const params = new URLSearchParams(location.search);
  const message = params.get("auth_error");
  if (!message) return;
  showLogin(message);
  // убираем параметр из адресной строки, чтобы он не висел после перезагрузки
  history.replaceState(null, "", location.pathname);
}

async function init() {
  wireEvents();
  try {
    const me = await api("/api/me");
    user = me.user;
    await startGame();
  } catch (err) {
    if (err.status === 401) showLogin();
    else showLogin("Не удалось связаться с сервером: " + err.message);
  }
  showAuthErrorFromUrl();
}

async function startGame() {
  renderUser();

  const dictionaries = await api("/api/companies");
  companies = dictionaries.companies;
  tiers = dictionaries.tiers;
  companyByName = new Map(companies.map(c => [c.name, c]));
  tierByKey = new Map(tiers.map(t => [t.key, t]));

  buildTierList();
  buildTierButtons();

  const { progress } = await api("/api/progress");
  if (progress) {
    state = {
      queue: progress.queue.slice(),
      current: progress.current,
      assignments: { ...progress.assignments },
      done: !!progress.done
    };
    reconcileWithCompanyList();     // пригодится, если список компаний на сервере поменялся
    showView("game");
    render();
    flash("Прогресс загружен с сервера");
  } else {
    newGame();
    showView("game");
    render();
    flash("Новый тир-лист — поехали!");
    saveProgress();
  }
}

/**
 * Если список компаний в companies.js изменили (добавили/убрали строки),
 * фронтенд сам приводит сохранённый прогресс в актуальный вид:
 * неизвестные компании выбрасывает, новые добавляет в конец очереди.
 */
function reconcileWithCompanyList() {
  const known = name => companyByName.has(name);

  const assignments = {};
  Object.keys(state.assignments || {}).forEach(name => {
    if (known(name) && tierByKey.has(state.assignments[name])) assignments[name] = state.assignments[name];
  });

  const queue = (state.queue || []).filter(known);
  let current = state.current && known(state.current) ? state.current : null;

  const used = new Set(queue.concat(Object.keys(assignments)));
  if (current) used.add(current);
  const missing = companies.map(c => c.name).filter(name => !used.has(name));
  if (missing.length) {
    shuffleInPlace(missing);
    queue.push(...missing);
  }

  let done = !!state.done && queue.length === 0 && !current;
  if (!done && !current && queue.length) current = queue.shift();
  if (!done && !current) done = true;

  const changed =
    missing.length > 0 ||
    current !== state.current ||
    done !== state.done ||
    JSON.stringify(queue) !== JSON.stringify(state.queue) ||
    JSON.stringify(assignments) !== JSON.stringify(state.assignments);

  state = { queue, current, assignments, done };
  if (changed) saveProgress();
}

/** Новый проход: компании перемешиваются, результат обнуляется. */
function newGame() {
  const names = companies.map(c => c.name);
  shuffleInPlace(names);
  state = {
    queue: names.slice(1),
    current: names.length ? names[0] : null,
    assignments: {},
    done: names.length === 0
  };
  historyStack = [];
}

/* ==================== построение интерфейса ==================== */

// 7 строк тир-листа: цветная плашка с буквой и подписью + тёмная зона под чипы
function buildTierList() {
  dom.tierList.textContent = "";

  tiers.forEach(tier => {
    const row = document.createElement("div");
    row.className = "tier";
    row.dataset.tier = tier.key;

    const label = document.createElement("div");
    label.className = "tier-label";
    label.style.background = tier.color;

    const letter = document.createElement("div");
    letter.className = "tier-letter";
    letter.textContent = tier.key;

    const name = document.createElement("div");
    name.className = "tier-name";
    name.textContent = tier.label;

    label.append(letter, name);

    const zone = document.createElement("div");
    zone.className = "tier-zone is-empty";
    zone.dataset.tier = tier.key;
    zone.setAttribute("aria-label", "Зона тира " + tier.key + " — " + tier.label);

    row.append(label, zone);
    dom.tierList.append(row);

    wireDropTarget(row, zone, tier.key);
  });
}

// Кнопки тиров под карточкой
function buildTierButtons() {
  dom.tierButtons.textContent = "";

  tiers.forEach(tier => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tbtn";
    btn.dataset.tier = tier.key;
    btn.style.background = tier.color;
    btn.title = tier.key + " — " + tier.label;

    const letter = document.createElement("span");
    letter.className = "l";
    letter.textContent = tier.key;

    const label = document.createElement("span");
    label.className = "t";
    label.textContent = tier.label;

    btn.append(letter, label);
    btn.addEventListener("click", () => {
      if (state && state.current) assign(state.current, tier.key);
    });
    dom.tierButtons.append(btn);
  });
}

// Чипы распределённых компаний внутри зон (в порядке распределения)
function renderChips() {
  const groups = {};
  tiers.forEach(t => { groups[t.key] = []; });
  Object.keys(state.assignments).forEach(name => {
    const tier = state.assignments[name];
    if (groups[tier]) groups[tier].push(name);
  });

  tiers.forEach(tier => {
    const zone = dom.tierList.querySelector('.tier[data-tier="' + tier.key + '"] .tier-zone');
    if (!zone) return;
    zone.textContent = "";

    groups[tier.key].forEach(name => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.dataset.name = name;
      chip.draggable = true;   // чип можно перетащить в другой тир
      chip.title = "Нажмите, чтобы перенести в другой тир или убрать";

      const dot = document.createElement("span");
      dot.className = "chip-dot";
      dot.style.background = tier.color;

      const text = document.createElement("span");
      text.textContent = name;

      chip.append(dot, text);
      zone.append(chip);
    });

    zone.classList.toggle("is-empty", groups[tier.key].length === 0);
  });
}

// Карточка текущей компании (или экран «Готово»)
function renderCard() {
  const hasCurrent = !!(state && state.current);

  dom.cardArea.hidden = !hasCurrent;
  dom.doneBox.hidden = hasCurrent || !(state && state.done);

  if (!hasCurrent) {
    if (state && state.done) {
      dom.doneHint.textContent = "Распределено компаний: " + Object.keys(state.assignments).length +
        ". Ошиблись? Кнопка «Отменить последнее» вернёт последнюю компанию в очередь.";
    }
    return;
  }

  const company = companyByName.get(state.current);
  dom.cardName.textContent = state.current;
  dom.cardSector.textContent = company ? company.sector : "";
  dom.cardSector.hidden = !company;
  dom.cardDesc.textContent = company ? company.desc : "";
}

// «Осталось: 5 из 13» + полоска прогресса
function renderProgress() {
  const total = companies.length;
  const remaining = state.queue.length + (state.current ? 1 : 0);
  const assigned = total - remaining;

  dom.progressText.textContent = "";
  const strong = document.createElement("b");
  strong.textContent = String(remaining);
  dom.progressText.append("Осталось: ", strong, " из " + total + " · распределено " + assigned);
  dom.progressBar.style.width = total ? (assigned / total * 100) + "%" : "0%";
}

function renderControls() {
  dom.btnSkip.disabled = !state.current;
  dom.btnUndo.disabled = historyStack.length === 0;
}

function render() {
  renderChips();
  renderCard();
  renderProgress();
  renderControls();
}

/* ==================== действия ==================== */

// Снимок состояния — чтобы «Отменить последнее» вернуло всё как было
function snapshot() {
  return {
    queue: state.queue.slice(),
    current: state.current,
    assignments: Object.assign({}, state.assignments),
    done: state.done
  };
}

function pushHistory() {
  historyStack.push(snapshot());
  if (historyStack.length > 100) historyStack.shift();
}

// Достаём следующую компанию из очереди
function nextCompany() {
  if (state.queue.length) {
    state.current = state.queue.shift();
    state.done = false;
  } else {
    state.current = null;
    state.done = true;
  }
}

// Отнести текущую компанию в тир
function assign(name, tierKey) {
  if (!state || !state.current || name !== state.current) return;
  if (!tierByKey.has(tierKey)) return;

  pushHistory();
  state.assignments[name] = tierKey;
  nextCompany();
  flash("«" + name + "» → " + tierKey + ": " + tierByKey.get(tierKey).label);
  render();
  saveProgress();
}

// Переместить уже размещённую компанию в другой тир
function moveChip(name, tierKey) {
  if (!state || !state.assignments[name]) return;
  if (!tierByKey.has(tierKey) || state.assignments[name] === tierKey) return;

  pushHistory();
  state.assignments[name] = tierKey;
  flash("«" + name + "» перемещён в " + tierKey + ": " + tierByKey.get(tierKey).label);
  render();
  saveProgress();
}

// Убрать чип из тира — компания возвращается в конец очереди
function removeChip(name) {
  if (!state || !state.assignments[name]) return;

  pushHistory();
  delete state.assignments[name];
  state.queue.push(name);
  if (!state.current) nextCompany(); else state.done = false;
  flash("«" + name + "» возвращён в очередь");
  render();
  saveProgress();
}

// Пропустить: компания уходит в конец очереди и покажется позже
function skipCurrent() {
  if (!state || !state.current) return;

  const name = state.current;
  state.queue.push(name);
  nextCompany();
  flash("«" + name + "» отложен — покажется позже");
  render();
  saveProgress();
}

// Отмена последнего распределения / перемещения / удаления чипа
function undo() {
  if (!state || !historyStack.length) return;

  const prev = historyStack.pop();
  state.queue = prev.queue;
  state.current = prev.current;
  state.assignments = prev.assignments;
  state.done = prev.done;
  flash("Последнее действие отменено");
  render();
  saveProgress();
}

// «Начать заново»: тот же пользователь, заново перемешанный список
function restartGame() {
  if (!state) return;
  newGame();
  render();
  flash("Новый проход: компании перемешаны заново");
  saveProgress();
}

// «Сбросить всё» — с подтверждением
function resetGame() {
  if (!state) return;
  if (!confirm("Удалить сохранённый тир-лист и начать заново?")) return;

  newGame();
  render();
  flash("Прогресс сброшен — начинаем заново");
  saveProgress();
}

async function logout() {
  try { await api("/auth/logout", { method: "POST" }); } catch { /* всё равно выходим */ }
  user = null;
  state = null;
  companies = [];
  historyStack = [];
  dom.tierList.textContent = "";
  dom.tierButtons.textContent = "";
  showLogin("Вы вышли из аккаунта");
}

/* ==================== меню чипа ==================== */

function openChipMenu(name, anchor) {
  const currentTier = state.assignments[name];
  dom.chipMenu.textContent = "";

  const title = document.createElement("div");
  title.className = "popover-title";
  title.textContent = "«" + name + "» — куда перенести?";
  dom.chipMenu.append(title);

  tiers.forEach(tier => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.tier = tier.key;
    btn.style.background = tier.color;
    btn.textContent = tier.key;
    btn.title = tier.label;
    if (tier.key === currentTier) btn.classList.add("is-current");
    btn.addEventListener("click", () => {
      moveChip(name, tier.key);
      closeChipMenu();
    });
    dom.chipMenu.append(btn);
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "pop-del";
  del.textContent = "Убрать из тира (вернуть в очередь)";
  del.addEventListener("click", () => {
    removeChip(name);
    closeChipMenu();
  });
  dom.chipMenu.append(del);

  dom.chipMenu.hidden = false;
  positionPopover(anchor);
}

// Ставим меню рядом с чипом, не давая ему уехать за край экрана
function positionPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  dom.chipMenu.style.left = "0px";
  dom.chipMenu.style.top = "0px";

  const box = dom.chipMenu.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - box.width - 8));
  let top = rect.bottom + 8;
  if (top + box.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - box.height - 8);
  }
  dom.chipMenu.style.left = left + "px";
  dom.chipMenu.style.top = top + "px";
}

function closeChipMenu() {
  dom.chipMenu.hidden = true;
}

/* ==================== drag & drop ==================== */
/* Мышь — нативный HTML5 drag&drop, палец — pointer events на «ручке» карточки. */

function clearDropHighlight() {
  tiers.forEach(tier => {
    const zone = dom.tierList.querySelector('.tier[data-tier="' + tier.key + '"] .tier-zone');
    if (zone) zone.classList.remove("is-over");
  });
}

// Каждая строка тира принимает и карточку, и чип
function wireDropTarget(row, zone, tierKey) {
  let depth = 0;   // счётчик входов, чтобы подсветка не мигала на дочерних элементах

  row.addEventListener("dragenter", e => {
    if (!dragName) return;
    e.preventDefault();
    depth++;
    zone.classList.add("is-over");
  });

  row.addEventListener("dragover", e => {
    if (!dragName) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  row.addEventListener("dragleave", () => {
    depth--;
    if (depth <= 0) {
      depth = 0;
      zone.classList.remove("is-over");
    }
  });

  row.addEventListener("drop", e => {
    if (!dragName) return;
    e.preventDefault();
    depth = 0;
    zone.classList.remove("is-over");

    const name = dragName;
    const source = dragSource;
    dragName = null;
    dragSource = null;

    if (source === "card") assign(name, tierKey);
    else moveChip(name, tierKey);
  });
}

// Перетаскивание карточки текущей компании мышью
function wireCardDrag() {
  dom.card.addEventListener("dragstart", e => {
    if (!state || !state.current) {
      e.preventDefault();
      return;
    }
    dragName = state.current;
    dragSource = "card";
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", dragName);
      e.dataTransfer.effectAllowed = "move";
    }
    dom.card.classList.add("is-dragging");
    document.body.classList.add("is-dragging");
  });

  dom.card.addEventListener("dragend", () => {
    dom.card.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging");
    dragName = null;
    dragSource = null;
    clearDropHighlight();
  });
}

// Перетаскивание чипа из тира в другой тир мышью
function wireChipDrag() {
  dom.tierList.addEventListener("dragstart", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    dragName = chip.dataset.name;
    dragSource = "chip";
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", dragName);
      e.dataTransfer.effectAllowed = "move";
    }
    chip.classList.add("is-dragging");
    document.body.classList.add("is-dragging");
  });

  dom.tierList.addEventListener("dragend", e => {
    const chip = e.target.closest(".chip");
    if (chip) chip.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging");
    dragName = null;
    dragSource = null;
    clearDropHighlight();
  });
}

/* ---------- перетаскивание пальцем (мобильные экраны) ---------- */

function tierAtPoint(x, y) {
  const node = document.elementFromPoint(x, y);
  const row = node && node.closest ? node.closest(".tier") : null;
  return row ? row.dataset.tier : null;
}

function moveGhost(x, y) {
  if (!ghost) return;
  ghost.style.left = x + "px";
  ghost.style.top = y + "px";
}

function highlightTierAt(x, y) {
  const tierKey = tierAtPoint(x, y);
  tiers.forEach(tier => {
    const zone = dom.tierList.querySelector('.tier[data-tier="' + tier.key + '"] .tier-zone');
    if (zone) zone.classList.toggle("is-over", tier.key === tierKey);
  });
}

function endTouchDrag() {
  touchName = null;
  if (ghost) { ghost.remove(); ghost = null; }
  document.body.classList.remove("is-dragging");
  clearDropHighlight();
}

function wireTouchDrag() {
  dom.grip.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;        // мышь пользуется нативным drag&drop
    if (!state || !state.current) return;

    e.preventDefault();
    touchName = state.current;
    try { dom.grip.setPointerCapture(e.pointerId); } catch { /* старые браузеры */ }

    ghost = document.createElement("div");
    ghost.className = "ghost";
    ghost.textContent = touchName;
    document.body.append(ghost);

    moveGhost(e.clientX, e.clientY);
    highlightTierAt(e.clientX, e.clientY);
    document.body.classList.add("is-dragging");
  });

  dom.grip.addEventListener("pointermove", e => {
    if (!touchName) return;
    moveGhost(e.clientX, e.clientY);
    highlightTierAt(e.clientX, e.clientY);
  });

  dom.grip.addEventListener("pointerup", e => {
    if (!touchName) return;
    const tierKey = tierAtPoint(e.clientX, e.clientY);
    const name = touchName;
    endTouchDrag();
    if (tierKey) assign(name, tierKey);
  });

  dom.grip.addEventListener("pointercancel", endTouchDrag);
}

/* ==================== события ==================== */

function wireEvents() {
  // Шапка
  dom.btnLogout.addEventListener("click", logout);
  dom.userAvatar.addEventListener("error", () => { dom.userAvatar.hidden = true; });

  // Кнопки игры
  dom.btnSkip.addEventListener("click", skipCurrent);
  dom.btnUndo.addEventListener("click", undo);
  dom.btnRestart.addEventListener("click", restartGame);
  dom.btnReset.addEventListener("click", resetGame);

  // Клик по чипу — меню «перенести / убрать»
  dom.tierList.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip || !state) return;
    e.stopPropagation();
    openChipMenu(chip.dataset.name, chip);
  });

  // Клик мимо меню закрывает его
  document.addEventListener("click", e => {
    if (dom.chipMenu.hidden) return;
    if (dom.chipMenu.contains(e.target)) return;
    closeChipMenu();
  });

  // Меню привязано к позиции чипа — при скролле и ресайзе просто закрываем
  window.addEventListener("resize", closeChipMenu);
  window.addEventListener("scroll", closeChipMenu, true);

  // Горячие клавиши: буквы тиров по e.code (работает в любой раскладке),
  // цифры 1–7, Ctrl/Cmd+Z — отмена, Esc — закрыть меню
  const HOTKEYS = {
    KeyS: "S", KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D", KeyE: "E", KeyF: "F",
    Digit1: "S", Digit2: "A", Digit3: "B", Digit4: "C", Digit5: "D", Digit6: "E", Digit7: "F"
  };

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeChipMenu();
      return;
    }

    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.ctrlKey || e.metaKey) {
      if (e.code === "KeyZ") {
        e.preventDefault();
        undo();
      }
      return;
    }

    if (dom.gameView.hidden || !state || !state.current) return;

    const tierKey = HOTKEYS[e.code];
    if (tierKey) {
      e.preventDefault();
      assign(state.current, tierKey);
    }
  });

  wireCardDrag();
  wireChipDrag();
  wireTouchDrag();
}

init();







