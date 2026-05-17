# Geometry Dash · TMA (v0.3)

Браузерная игра в стиле Geometry Dash. Канвас **landscape 16:9 (960×540)** —
Phaser.Scale.FIT масштабирует под любой размер окна. Запускается локально
одной командой, без бэка и без обязательной Telegram-инфраструктуры.

## Что нового в v0.3

- 🟪 **Landscape 16:9** — канвас 960×540 (раньше был portrait 540×960). Уровни, редактор и параллакс пересчитаны под новую вертикаль (~11.6 ячеек play area).
- ⬆️ **Прыжок выше** — `JUMP_FORCE` -560 (раньше -420), `PAD_FORCE` -820. Куб уверенно перепрыгивает 3-клеточные стеки, держание клавиши даёт ещё +50% высоты.
- 🌀 **Порталы по x-crossing** — триггерятся при пересечении вертикали портала, независимо от y игрока (ship-mode и flipped-gravity больше не могут «промахнуться»).
- ⛓ **Шипы на потолке** — для перевёрнутой гравитации в Gravity Rush и ship-коридоре в Dark Pulse шипы рисуются вверх ногами (rotation 180°) с симметричным хитбоксом.

> **Внимание для тех, у кого есть user levels из v0.2:** старые уровни сохранялись с `groundY=768` (portrait) — в 16:9 они окажутся вне экрана. Удалите их через Level Select → корзина и создайте заново. Прогресс по встроенным уровням сохранится.

## Что нового в v0.2

- ✅ **Редактор уровней** — grid 32px, drag & drop палитра, авто-превью кнопкой Play, save в User Levels, undo/redo, настройки (длина/BPM/сложность/цвета)
- ✅ **Beat sync** — WebAudio синт (kick + hat + snare) с настраиваемым BPM на уровне, пульс фона и игрока на бит
- ✅ **Режимы игрока** — cube (как было), ship (hold = летит вверх), ball (tap = переворачивает гравитацию)
- ✅ **Порталы** — gravity_portal (флип гравитации), ship_portal (вход в режим корабля), cube_portal (возврат)
- ✅ **Новые shapes скинов** — ball, ship (рендерятся и в Phaser, и в превью)
- ✅ **2 новых уровня** — Gravity Rush (Hard, с гравитацией) и Dark Pulse (Hard, с ship-режимом)
- ✅ **User Levels** в меню — пройти/редактировать/удалить свои уровни
- ✅ **Мьют звука** — иконка на главном экране и в Level Select

## Запуск и тестирование

```bash
cd "Geometry Dash"
npm install     # ~40 секунд первый раз
npm run dev
```

Обычно откроется на [http://localhost:5173](http://localhost:5173). Если этот порт уже занят, Vite напишет в терминале новый адрес, например `http://localhost:5174/` — открывай именно тот адрес, который показан после `Local:`.

Можно также запускать через:

```bash
npm start
```

### Что попробовать в первую очередь

1. **Главное меню → ИГРАТЬ → First Jump** — базовый геймплей. Тапай чтобы прыгать, удерживай для высокого прыжка.
2. **Главное меню → ИГРАТЬ → Gravity Rush** — пройди через зелёный портал `↕`, гравитация перевернётся, дальше бежишь по потолку.
3. **Главное меню → ИГРАТЬ → Dark Pulse** — пройди синий `▶` портал, превратишься в корабль; держи палец, чтобы лететь вверх, отпусти чтобы падать. Потом фиолетовый `▢` вернёт куб.
4. **Главное меню → СКИНЫ** — выбери Aqua Ball или Stealth Ship, поменяй primary/secondary цвета.
5. **Главное меню → СОЗДАТЬ** — расставь несколько блоков, шипов, портал; нажми **▶ PLAY** для немедленного теста, потом **SAVE** чтобы положить в User Levels.
6. **Главное меню → ИГРАТЬ** прокрути вниз до раздела «User Levels» — там твои сохранённые уровни. Можно редактировать или удалить.

### Звук

Браузеры обычно блокируют WebAudio до первого жеста пользователя — это значит, что бит появится только после первого тапа в гейплее (это норма). На главном экране есть кнопка мьюта (🔊/🔇).

### Telegram

Откроется и в Telegram Web App автоматически — `window.Telegram.WebApp.ready()` и `expand()` вызываются на инициализации. Haptic feedback работает там, где есть SDK. Без Telegram всё работает в обычном браузере как обычно.

## Управление

| Действие             | Mobile / Touch | Desktop      |
| -------------------- | -------------- | ------------ |
| Прыжок / тяга вверх  | tap            | Space / ↑    |
| High jump / держать  | hold tap       | hold key     |
| Сменить тул в редакторе | tap по палитре | — |
| Скролл в редакторе   | swipe / pan кнопки `◀` `▶` | drag |
| Выйти                | кнопка ←       | Esc          |

## Структура проекта

```
src/
├── App.tsx                       # роутер по screen из store
├── main.tsx                      # bootstrap React + Telegram init
├── index.css                     # Tailwind + неоновые компоненты
├── store/gameStore.ts            # zustand: screen, skin, прогресс, муте, draft, userLevels
├── telegram/telegram.ts          # обёртка Telegram WebApp с fallback
├── game/
│   ├── PhaserGame.ts             # фабрика gameplay Phaser.Game
│   ├── EditorRunner.ts           # фабрика editor Phaser.Game
│   ├── audio/BeatEngine.ts       # WebAudio синт kick/hat/snare + beat listeners
│   ├── scenes/
│   │   ├── BootScene.ts          # генерирует все текстуры (блоки/шипы/порталы)
│   │   ├── GameplayScene.ts      # мир, физика, камера, коллизии, win/death, beat-sync
│   │   ├── UIScene.ts            # HUD: имя, прогресс, попытки
│   │   └── EditorScene.ts        # grid, drag-pan, tap-to-place, undo/redo
│   ├── player/Player.ts          # cube/ship/ball режимы, прыжок, hold-fly, flip
│   ├── levels/
│   │   ├── types.ts              # LevelData / LevelObject / ObjectKind / PlayerMode
│   │   ├── levels.ts             # 4 встроенных уровня
│   │   └── LevelLoader.ts        # user > builtin > assets fetch
│   └── skins/skins.ts            # 6 пресетов (4 cube + ball + ship)
└── ui/
    ├── MainMenu.tsx
    ├── SkinMenu.tsx              # превью с shape-рендером (cube/ball/ship/wave)
    ├── LevelSelect.tsx           # builtin + user levels + edit/delete
    ├── GameView.tsx              # Phaser геймплей-маунт + win/lose модалка
    └── Editor.tsx                # React shell для редактора (топ-бар + палитра + настройки)
```

## Формат уровня

```json
{
  "id": "user_xyz",
  "name": "Level Name",
  "difficulty": "Hard",
  "length": 7000,
  "groundY": 768,
  "bpm": 145,
  "colors": {
    "primary": "#FF6A3D",
    "secondary": "#FFD23F",
    "background": "#1A0A14",
    "ground": "#3A1A20"
  },
  "objects": [
    { "id": "spike",          "x": 656,  "y": 752 },
    { "id": "block",          "x": 1360, "y": 752 },
    { "id": "jump_pad",       "x": 1744, "y": 752 },
    { "id": "gravity_portal", "x": 2400, "y": 528 },
    { "id": "ship_portal",    "x": 4000, "y": 528 },
    { "id": "cube_portal",    "x": 5500, "y": 528 }
  ]
}
```

`id` объектов: `block`, `spike`, `jump_pad`, `gravity_portal`, `ship_portal`, `cube_portal`. Координаты в пикселях, grid = 32.

## Известные ограничения / на следующие сессии

- **Этап 6 (бэк)** — пока нет. Уровни хранятся только в localStorage браузера. Для шеринга между устройствами нужен Node + Prisma + PostgreSQL/SQLite. Это следующий шаг.
- **Этап 7 (Telegram auth)** — заглушка SDK на месте, но валидации `initData` на бэке нет (т.к. бэка нет).
- **Wave-режим** — фигура в скинах есть, но как игровой режим (zigzag-полёт) не подключён, оставлен на ближайшую сессию.
- **Реальные музыкальные треки** — пока используется чистый WebAudio синт (kick + hat + snare). Подкладка трека через Howler.js — следующий шаг, файлы аудио кладутся в `/public/assets/sounds/` и referенс через `level.music`.
- **Ball-mode tightness** — gravity flip срабатывает только при касании поверхности; в воздушных секциях ball ведёт себя как куб без джампа. Это упрощение MVP.
- **Длинные уровни** — на ~150+ объектов рендер всё ещё держит 60 FPS на mid-range mobile, но object pooling даст запас. На v0.3.

## Что осталось из ТЗ (для следующей сессии)

1. **Бэкенд** (Этап 6): Express + Prisma + SQLite/PostgreSQL, маршруты `/auth/telegram`, `/levels`, `/user/profile`, кеш Redis, JWT
2. **Полная Telegram-интеграция** (Этап 7): валидация `initData` hash, cloud-save прогресса, кнопка share, лидерборд
3. **Реальная музыка** — лоадер mp3 через Howler с timeline-синхронизацией
4. **Wave-режим** игрока + соответствующий портал
5. **Online levels & клан-система** (v2.0)
