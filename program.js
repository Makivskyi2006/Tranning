'use strict';
// Mike Boreyko program (simplified to one week): Push / Pull / Legs + deload.
// P(название, подходы, повторения, отдых в сек, ЗДО, {warm: нужны разминочные подходы, note})
const P = (name, sets, reps, rest, rir, o = {}) =>
  ({ name, sets, reps, rest, rir, warm: !!o.warm, note: o.note || '' });
const W = { warm: true };
const DROP = 'Drop set: −30% weight, no rest, 3 times';

// ---------- ТЯНИ ----------
const PULL_A = [
  P('Вертикальная тяга блока широким хватом', 3, '6-8', 180, 0, W),
  P('Рычажная горизонтальная тяга по 1-й руке', 3, '6-8', 180, 0),
  P('Тяга нижнего блока с упором в скамью', 3, '7-8', 180, 1),
  P('Разведение на заднюю дельту в Peck-Deck', 3, '8-10', 120, 0, W),
  P('Сгибания рук в тренажере Скотта', 2, '7-8', 120, 0, W),
  P('Молотки с канатом', 2, '7-8', 120, 1),
  P('Молитва в блоке', 3, '12-15', 60, 1),
];

// ---------- ТОЛКАЙ ----------
const PUSH_A = [
  P('Жим в Смите в наклоне', 3, '7-8', 180, 0, W),
  P('Жим гантелей лежа', 3, '6-8', 180, 1),
  P('Жим в Хаммере на низ груди', 3, '6-8', 180, 1),
  P('Сведение в Peck-Deck на верх груди', 2, '10-12', 120, 0),
  P('Отведение гантелей в стороны стоя', 3, '8-10', 120, 0, { warm: true, note: 'Last set: drop set' }),
  P('Разгибания в блоке с прямой рукоятью', 3, '8-10', 120, 1, W),
  P('Разгибания из-за головы в блоке', 3, '8-10', 120, 0, W),
];

// ---------- НОГИ ----------
const LEGS_A = [
  P('Сгибания ног на бицепс бедра в тренажере стоя по 1-й ноге', 3, '6-8', 180, 0, W),
  P('Разгибания ног в тренажере', 2, '7-8', 180, 0, W),
  P('Жим ногами', 3, '7-8', 180, 1),
  P('Подъемы на носки в тренажере сидя', 4, '15', 60, 0),
];

// ---------- РАЗГРУЗКА ----------
const LIGHT_1 = [
  P('Вертикальная тяга блока широким хватом', 4, '15', 120, null, W),
  P('Жим в Смите в наклоне', 4, '15', 120, null, W),
  P('Подъем штанги на бицепс', 3, '15', 120, null),
  P('Разгибания в блоке с прямой рукоятью', 3, '15', 120, null),
  P('Молитва в блоке', 3, '15', 60, 2),
];
const LIGHT_2 = [
  P('Жим ногами', 3, '15', 120, null, W),
  P('Мертвая тяга', 3, '15', 120, null, W),
  P('Жим гантелей сидя', 3, '15', 120, null),
  P('Отведение в кроссовере по 1-й руке', 3, '20', 120, null, W),
];

const day = (n, kind, title, ex) => ({ id: `h1d${n}`, block: 'Program', kind, ex, title });
const light = (n, kind, ex) => ({ id: `l${n}`, block: 'Deload', kind, ex, title: `Deload · ${kind}` });

// Одна неделя, повторяется по кругу
const WORKOUTS = [day(2, 'Push', 'Chest, shoulders, triceps', PUSH_A), day(1, 'Pull', 'Back, biceps', PULL_A), day(3, 'Legs', 'Legs', LEGS_A)];
// Разгрузочная неделя: включается вручную из плана
const EXTRA = [light(1, 'Back, chest, arms', LIGHT_1), light(3, 'Legs, shoulders', LIGHT_2)];
const ALL_WORKOUTS = [...WORKOUTS, ...EXTRA];

// Группы мышц (порядок = порядок показа на вкладке «Прогресс»)
const GROUPS = ['Грудь', 'Спина', 'Плечи', 'Бицепс', 'Трицепс', 'Ноги', 'Пресс'];
const GROUP_RULES = [
  ['Пресс', /Молитва|ног в висе/],
  ['Ноги', /(^|\s)ног|Присед|Мертвая|Выпады|носки/],
  ['Трицепс', /Разгибания/],
  ['Бицепс', /Молотки|Сгибания рук|бицепс|Скотта/],
  ['Плечи', /задн|Отведение|Жим гантелей сидя/],
  ['Спина', /[Тт]яга|Пулловер/],
  ['Грудь', /Жим|Сведение|Протяжка/],
];
const groupOf = name => (GROUP_RULES.find(([, re]) => re.test(name)) || ['Другое'])[0];

// English display names (keys stay Russian so existing history keeps matching)
const EN = {
 "Вертикальная тяга блока широким хватом": "Wide-grip lat pulldown",
 "Вертикальная тяга блока параллельным хватом": "Neutral-grip lat pulldown",
 "Вертикальная тяга блока узким хватом": "Close-grip lat pulldown",
 "Рычажная горизонтальная тяга по 1-й руке": "Single-arm plate-loaded row",
 "Пулловер в блоке с упором спиной": "Cable pullover (back supported)",
 "Горизонтальная тяга блока по 1-й руке": "Single-arm cable row",
 "Тяга гантелей с упором в скамью": "Chest-supported dumbbell row",
 "Горизонтальная тяга блока с акцентом на ширину": "Wide-grip cable row",
 "Тяга нижнего блока с упором в скамью": "Chest-supported low cable row",
 "Разведение на заднюю дельту в Peck-Deck": "Pec deck rear delt fly",
 "Разведение гантелей с упором в скамью (задняя дельта)": "Chest-supported rear delt fly",
 "Отведение в кроссовере по 1-й руке": "Single-arm cable lateral raise",
 "Отведение гантелей в стороны стоя": "Standing dumbbell lateral raise",
 "Отведение рук в кроссовере лежа": "Lying cable lateral raise",
 "Отведение гантелей с упором в скамью": "Chest-supported lateral raise",
 "Жим гантелей сидя": "Seated dumbbell shoulder press",
 "Жим в Смите в наклоне": "Incline Smith press",
 "Жим в Хаммере на низ груди": "Hammer press (lower chest)",
 "Жим в Хаммере на верх груди": "Hammer press (upper chest)",
 "Сведение в кроссовере лежа на наклонной скамье": "Incline cable fly",
 "Жим гантелей в наклоне": "Incline dumbbell press",
 "Сведение в Peck-Deck на низ груди": "Pec deck fly (lower chest)",
 "Сведение в Peck-Deck на верх груди": "Pec deck fly (upper chest)",
 "Протяжка с нижнего блока": "Low-pulley cable fly",
 "Жим гантелей лежа": "Flat dumbbell press",
 "Сведение в кроссовере стоя": "Standing cable fly",
 "Сгибания рук в тренажере Скотта": "Preacher curl machine",
 "Молотки с канатом": "Rope hammer curl",
 "Подъем гантелей на бицепс сидя на наклонной скамье": "Seated incline dumbbell curl",
 "Сгибания рук с нижнего блока": "Low cable curl",
 "Подъем штанги на бицепс": "Barbell curl",
 "Разгибания в блоке с прямой рукоятью": "Triceps pushdown (straight bar)",
 "Разгибания из-за головы в блоке": "Overhead cable triceps extension",
 "Разгибания в блоке по 1-й руке": "Single-arm cable extension",
 "Разгибания с гантелью из-за головы по 1-й руке": "Single-arm overhead dumbbell extension",
 "Разгибания из-за головы в блоке по 1-й руке": "Single-arm overhead cable extension",
 "Приседания в Гакке": "Hack squat",
 "Приседания в Смите": "Smith machine squat",
 "Сгибания ног на бицепс бедра в тренажере стоя по 1-й ноге": "Standing single-leg hamstring curl",
 "Разгибания ног в тренажере": "Leg extension",
 "Жим ногами": "Leg press",
 "Подъемы на носки в тренажере стоя / в Смите": "Standing calf raise",
 "Подъемы на носки в тренажере сидя": "Seated calf raise",
 "Мертвая тяга": "Deadlift",
 "Выпады с гантелями / штангой": "Lunges (dumbbell / barbell)",
 "Молитва в блоке": "Cable crunch",
 "Подъемы ног в висе": "Hanging leg raise"
};
const exName = n => EN[n] || n;
const GROUP_EN = { 'Грудь': 'Chest', 'Спина': 'Back', 'Плечи': 'Shoulders', 'Бицепс': 'Biceps', 'Трицепс': 'Triceps', 'Ноги': 'Legs', 'Пресс': 'Abs', 'Другое': 'Other' };
