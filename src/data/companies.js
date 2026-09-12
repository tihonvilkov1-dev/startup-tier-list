/**
 * Список стартапов для тир-листа — единственный источник правды.
 * Фронтенд получает его через GET /api/companies.
 *
 * 59 компаний — тот же набор, что в однофайловой версии проекта.
 */
export const companies = [
  {"name":"Cognition AI","sector":"AI/Agents","desc":"Создаёт AI-инженера Devin, который сам пишет, тестирует и запускает код"},
  {"name":"Rogo","sector":"AI/Agents","desc":"AI-платформа для банков и инвесткомпаний: финансовый анализ, модели, документы"},
  {"name":"Lyon","sector":"AI/Agents","desc":"Специализированные AI-модели для банков и страховых, обученные на их данных"},
  {"name":"Zomma","sector":"AI/Agents","desc":"AI-агенты вместо финансовых сотрудников: KYC, проверка транзакций, споры"},
  {"name":"Definite","sector":"AI/Agents","desc":"Превращает финансовый back-office в систему AI-агентов поверх бухгалтерии"},
  {"name":"Levocred AI","sector":"AI/Agents","desc":"AI-агенты для оценки и управления огромными портфелями кредитов"},
  {"name":"Billow AI Labs","sector":"AI/Agents","desc":"AI автоматизирует бухгалтерию, FP&A, согласования и подготовку к аудиту"},
  {"name":"Rational","sector":"AI/Agents","desc":"Строит бухгалтерскую фирму, где почти вся работа делается AI-сотрудниками"},
  {"name":"TovenAI","sector":"AI/Agents","desc":"AI-агенты для compliance-команд крупных финансовых компаний"},
  {"name":"jo","sector":"AI/Agents","desc":"Персональный AI-агент с долговременной памятью — цифровой помощник"},
  {"name":"Stormy","sector":"AI/Agents","desc":"AI-сотрудник для офисной работы и customer support, делает задачи вместо человека"},
  {"name":"Pally","sector":"AI/Agents","desc":"AI-помощник, которому пишут как другу: почта, календарь, файлы, задачи, интернет"},
  {"name":"Serafis","sector":"AI/Agents","desc":"Анализирует массивы данных о рынках, чтобы находить изменения раньше инвесторов"},
  {"name":"Wispr Flow","sector":"AI/Voice","desc":"Речь в текст и управление компьютером голосом; уже в тысячах организаций"},
  {"name":"Higgsfield","sector":"AI/Video","desc":"AI-генерация видео: сложные кинематографические сцены генеративными моделями"},
  {"name":"OpenRouter","sector":"AI Infra","desc":"Инфраструктура с единым API к большому числу AI-моделей для разработчиков"},
  {"name":"Thinking Machines Lab","sector":"AI/LLM","desc":"AI-лаборатория для более универсальных и адаптируемых моделей"},
  {"name":"Mistral AI","sector":"AI/LLM","desc":"Французская AI-компания со своими LLM и инфраструктурой; в 2026 привлекла €3 млрд"},
  {"name":"PRINCEPS","sector":"Fintech","desc":"Страховка для AI-инфраструктуры: GPU, дата-центры, перебои и другие риски"},
  {"name":"Pennant","sector":"Fintech","desc":"AI для институциональных инвесторов: голосования, корпуправление, позиции"},
  {"name":"Collar","sector":"Fintech","desc":"Автоматизирует investor-relations: анализ конкурентов, earnings, поиск инвесторов"},
  {"name":"Instinct","sector":"Fintech","desc":"Мобильное приложение для торговли с единой точкой доступа к мировым рынкам"},
  {"name":"Pacific","sector":"AI Infra","desc":"Модульные микро-дата-центры: ставятся за дни там, где уже есть электроэнергия"},
  {"name":"Zolvo","sector":"Fintech","desc":"AI-инструменты для commercial lending: кредиты бизнесу выдаются быстрее"},
  {"name":"Proximitty","sector":"Fintech","desc":"AI operating system для commercial lending и работы с корпоративными кредитами"},
  {"name":"Archer","sector":"Fintech","desc":"Платёжная инфраструктура для новой экономики AI и stablecoin-платежей"},
  {"name":"Veltha","sector":"Fintech","desc":"AI-native страховой TPA: автоматически обрабатывает страховые случаи"},
  {"name":"Atlia","sector":"Fintech","desc":"Финансовая инфраструктура для компаний, работающих с большими данными и AI"},
  {"name":"Piggy","sector":"Robotics","desc":"Гуманоидные роботы для физических задач в промышленности"},
  {"name":"Deploy","sector":"Robotics","desc":"Универсальные роботы для реальных задач бизнеса вместо узких машин"},
  {"name":"Shepherd Robotics","sector":"Robotics","desc":"Универсальные роботы для физического труда и объектов AI-инфраструктуры"},
  {"name":"PerfectBit","sector":"Robotics","desc":"Обучает AI-модели управлять роботами в реальном непредсказуемом мире"},
  {"name":"Grip","sector":"Robotics","desc":"Роботы для сортировки мусора и переработки; учатся на своих попытках захвата"},
  {"name":"Cohesive Robotics","sector":"Robotics","desc":"Роботизированные системы для промышленной сварки, шлифовки и других операций"},
  {"name":"Volumes","sector":"Robotics","desc":"Система сбора физических данных для обучения следующего поколения роботов"},
  {"name":"Snowbotix","sector":"Robotics","desc":"Автономные роботы для работы со снегом и задач городской инфраструктуры"},
  {"name":"Field AI","sector":"Robotics AI","desc":"Универсальный AI-«мозг» для роботов в сложных физических пространствах"},
  {"name":"Skild AI","sector":"Robotics AI","desc":"Foundation models для роботов — как LLM стали фундаментом для AI-приложений"},
  {"name":"Generalist","sector":"Robotics AI","desc":"Универсальные роботы для большого количества разных физических задач"},
  {"name":"Dexterity","sector":"Robotics","desc":"AI-роботы для складов и промышленности со сложными манипуляциями"},
  {"name":"Gravis Robotics","sector":"Robotics","desc":"Автономная техника и AI для тяжёлых строительных и промышленных работ"},
  {"name":"Dash Bio","sector":"Robotics/Bio","desc":"Роботизированные системы для автоматизации лабораторных экспериментов"},
  {"name":"Synphony","sector":"AgTech Robotics","desc":"Роботы с AI для автоматизации сбора урожая, включая сбор клубники"},
  {"name":"Avatar Robotics","sector":"Robotics","desc":"Гуманоидные и телеуправляемые роботы для сложных физических сред"},
  {"name":"Xpeng Robotics","sector":"Robotics","desc":"Гуманоидные роботы XPeng; в 2026 привлекли более $900 млн при оценке $6,3 млрд"},
  {"name":"Clara","sector":"Health AI","desc":"AI-доктор, автоматизирующий первичную медицинскую помощь и диагностику"},
  {"name":"Amissa","sector":"Health AI","desc":"AI-платформа для помощи женщинам во время менопаузы"},
  {"name":"Biolinco","sector":"BioTech","desc":"AI и высокопроизводительный screening для поиска новых лекарств"},
  {"name":"Cerevanta","sector":"Neurotech","desc":"Разрабатывает технологию 4D-сканирования мозга в реальном времени"},
  {"name":"Parasma","sector":"Neurotech","desc":"Пытается использовать живые клетки мозга как вычислительный ресурс"},
  {"name":"Forus","sector":"Health AI","desc":"AI-платформа в здравоохранении: автоматизация процессов медпомощи"},
  {"name":"Isomorphic Labs","sector":"BioTech AI","desc":"AI для разработки лекарств и моделирования биологических процессов"},
  {"name":"Baud","sector":"Chips","desc":"Специализированные AI-чипы для ускорения обучения и inference нейросетей"},
  {"name":"Groq","sector":"Chips","desc":"Процессоры и инфраструктура для очень быстрого запуска AI-моделей"},
  {"name":"Nscale","sector":"AI Infra","desc":"Инфраструктура для AI-вычислений и GPU-дата-центров"},
  {"name":"Positron AI","sector":"Chips","desc":"AI-чипы для inference и обучения моделей; в 2026 привлекла $875 млн"},
  {"name":"Atoms","sector":"Industrial AI","desc":"Industrial-AI компания Трэвиса Каланика: автономные системы для промышленности, транспорта и mining; в 2026 привлекла ~$1,7 млрд"},
  {"name":"Galaxea AI","sector":"Robotics","desc":"Китайская robotics-компания: гуманоидные роботы и AI для управления ими; оценка ~$3 млрд"},
  {"name":"Harmoni","sector":"Industrial AI","desc":"AI для старых заводов: подключает модели к существующему оборудованию без стройки"},
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
