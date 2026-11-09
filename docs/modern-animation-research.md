# Curvature — дослідження єдиної системи фізичної анімації

**База коду:** реконструйований стан після Compatpatch #140.12.119.3 (`248512a` у дослідницькому Git-дереві).  
**Статус дослідження:** підготовлено до реалізації #140.12.120.1; початкові висновки збережено без змін. Реалізацію та фактичні межі див. в розділі 9 нижче.  
**Ключове рішення:** рівно два режими анімації — `camera` або `physical`; одночасна зміна камери та фізики заборонена.

## 1. Що перевірено в коді

- `src/camera/ModernCameraSequence.js`: до 20 keyframes, `travelMs`, `holdMs`, `linear/smoothstep`, абсолютне семплювання за часом. Кадр камери містить 9 полів.
- `src/camera/ModernCameraInterpolator.js`: East/North/Height/Nick інтерполюються лінійно; Pan/Roll — найкоротшим кутовим шляхом; `FocalLengthField` — логарифмічно; aim mode і aspect ratio **не можна змінювати** посеред переходу.
- `src/ui/modern/ModernApp.js`: чинна Camera Animation тимчасово змінює live `model` під час Play; при Stop залишається поточна позиція, при Cancel повертається початкова. `requestAutoCameraPreview()` пропускає дорогі кадри (120 мс між запитами) та підтримує Fast лише для обмеженого набору профілів.
- `src/ui/modern/ModernExperimentState.js`: один збережений експеримент містить сцену/камеру/об'єкти/геометрію/атмосферу та Compare A/B, а також опціональний старий `cameraSequence`.
- `src/ui/modern/ModernExperimentFingerprint.js`: є нормалізовані ознаки **активної** геометрії та рефракції, але `relations` порівнює A з B **у межах одного експерименту**. Це НЕ валідатор переходів між двома снапшотами. `physicalSignature` пропускає камеру й частину presentation flags, `exactSignature` занадто сувора для анімації (включає службові дані).
- `src/ui/modern/ModernExperimentHistory.js`, `ModernApplicationPreferences.js`: History зберігає повні експерименти в IndexedDB, але `historyStoryboardQueue` містить тільки локальні ID (не переносний проєкт і не гарантує збереження auto-record).
- `src/app/CurvaturePhysicalCurvature.js`: інтерфейс уже має діапазон радіусів і кінцеву точку **точно Flat** (`κ=0`). Шкала слайдера логарифмічна за радіусом, отже кроки слайдера не дорівнюють рівномірним крокам фізичної кривини.
- `src/geometry/CurvatureSurfaceGeometry.js`: математичне ядро має `createFromCurvature(κ)`, включно з κ=0, і чисельно стабільну геометрію для малих κ.
- `src/optics/OpticalRayTracer.js`: `temperature-lapse` — суха гідростатична модель пограничного шару з експоненційним затуханням вертикального градієнта, **не** глобальний закон лінійного спадання температури; діапазон градієнта −20…+20 K/km, базової температури −30…40 °C, тиску 800…1100 hPa.
- `src/ui/modern/ModernExperimentThumbnail.js`: мініатюри обмежені 480×300 для одного viewport; вони придатні для редактора, але не для відеокадрів високої якості.

**Локальна перевірка:** 31/31 прицільних тестів пройдено (`ModernCameraSequence`, `ModernCameraInterpolator`, `ModernExperimentHistoryFilters`, `ModernTemperatureGradient`, `ModernExperimentState`). Це перевірка поточної основи, а не тест майбутньої Animation Studio. Браузерні FPS/latency тут не виміряні.

## 2. Семантика двох режимів

### Camera Animation

- Можуть змінюватися: лише неперервні координати/орієнтація/оптика камери (`Height`, `CameraEast`, `CameraNorth`, `Pan`, `Nick`, `Roll`, `FocalLengthField`).
- Мають лишатися сталими: режим Scene/Compare, поверхня та фізика всіх активних моделей, об'єкти, `viewcenterHorizon`, `deviceRatio`, усі параметри збереженої композиції, які впливають на кадр.
- Якщо режим Compare, камера спільна для A і B; обидва вікна реагують на один її рух, але їхні фізичні умови нерухомі.
- З наявного `ModernCameraInterpolator` і `ModernCameraSequence` можна повторно використати числову інтерполяцію та таймлайн; live-мутацію під час playback слід замінити на ізольований стан перегляду.

### Physical Parameter Animation

- Камера повністю нерухома, як і об'єкти та презентаційні опції.
- У межах *усього проєкту* змінюється **одна фізична незалежна змінна**, а не по черзі різні змінні на різних сегментах.
- Дозволені початкові канали: `surface.curvature` (включно Globe↔Flat) та `temperatureProfile.gradientKPerKm` у моделі `temperature-lapse`.
- За умови окремої валідації можна згодом додати температуру поверхні, тиск, `transitionProfile.weight` та інші конкретні числові параметри. Для математично гіпотетичних профілів потрібне виразне маркування.
- **Не дозволяти автоматично** дискретні стрибки `atmosphere = vacuum/standard/…`, зміну режиму Scene↔Compare, зміну об'єктів та одночасну зміну кривини й градієнта. Для інтерполяції *законів* `n(h)` треба окремо визначити фізичний сенс та допустиму модель.
- Для Compare у першій версії дозволити зміну **однієї сторони** (A або B), друга незмінна. Спільні синхронні зміни A і B — можливе окреме явне розширення, але не за замовчуванням.

## 3. Головний відсутній модуль — перехресний валідатор

Новий `AnimationCompatibility` повинен працювати з нормалізованими `ModernExperimentState.validate` снапшотами, а не з UI або WebGL/Canvas.

Для всіх ключових кадрів:
1. Перевірити однаковий режим відображення і сталу конфігурацію сцени (об'єкти, presentation fields, неанімовані активні фізичні входи).
2. Відкинути службові відмінності, які не впливають на результат: ID, ім'я, опис, дати, source, pin, попередньо збережену Camera Animation, неактивний радіус у Flat, неактивні градієнти у Vacuum, поточну вкладку/Compare editor.
3. Побудувати **diff між снапшотами**, а не `features.relations` (це лише A↔B всередині одного снапшота).
4. Ідентифікувати один глобальний `channel`: `camera` або строго визначений `physical` шлях і цільовий viewport (`scene`, `A`, `B`).
5. Переконатися, що **всі** ключові кадри відрізняються тільки в цьому каналі; вибір між кількома валідними режимами має бути явним, не вгадувати за назвою.
6. Для невідповідності повертати структурований список причин, наприклад `camera.Height`, `compare.A.temperatureProfile.gradientKPerKm`, `scene.objects`.
7. Семплювати лише валідовану незмінну копію стану (`sampleAt(timeMs)`), а не змінювати History/session.

**Звернути увагу:** `physicalSignature` корисна для первинного тесту сталості фізики, але сама по собі не перевіряє presentation flags, камера/об'єкти/режим і тип змінної. `exactSignature` включає зайві editor/persistence поля.

## 4. Числова інтерполяція

### Кривина

Внутрішній канал: `κ=1/R` для сфери і `κ=0` для точної площини. Рекомендований початковий тест: `κ(u) = (1-u) κ₀ + u κ₁`, де `u∈[0,1]` (linear або окремо задане easing). Значення κ конвертується в чинну модель `showModel/rEarth`: κ>0 → Globe, κ=0 → Flat. `CurvatureSurfaceGeometry.createFromCurvature` дає математично точну основу; рендерингові адаптери ще треба перевірити в реальних кадрах.

Наприклад, Земля R=6371 км → Flat: у середині шляху за *лінійною кривиною* R=12742 км, а не середнє значення радіусів. Це не те саме, що рухати теперішній логарифмічний слайдер з рівномірною швидкістю.

У чинних полях `rEarth` максимальний R=10¹⁶ м; на останньому кроці ставити точний Flat. Якщо потрібно семплювати κ нижче `1/10¹⁶ м⁻¹`, слід узгодити обмеження й конвертацію, а не мовчки переписувати фізику. Фізична кривина тут гіпотетичний контрольний параметр моделі, а не реальне «перетворення Землі».

### Температурний градієнт

При незмінних `temperatureC`, `pressureHpa`, геометрії та камері можна інтерполювати лише `gradientKPerKm` і передати значення у наявний `temperature-lapse` трасувальник. **Не інтерполювати зображення** — кожен проміжний кадр повинен мати нове `n(h)` і трасовані промені. Контроль меж −20…+20 K/km на всьому шляху; інтерполяція двох допустимих кінців у цьому діапазоні залишається допустимою.

Слід окремо вибрати метрику easing: для досліду корисніше за замовчуванням `linear` за значенням параметра і підпис його поточного значення на кадрі.

## 5. Дані та переносимість

Рекомендована власна сутність `AnimationProject` (версіонований JSON у IndexedDB), незалежна від History і від необов'язкового старого `experiment.cameraSequence`:

```json
{
  "version": 1,
  "id": "local-stable-id",
  "name": "Gradient study",
  "mode": "physical",
  "target": {"scope": "scene", "parameter": "temperatureProfile.gradientKPerKm"},
  "baseExperiment": "validated self-contained experiment payload",
  "keyframes": [
    {"sourceSnapshotId": 12, "value": -6.5, "travelMs": 0, "holdMs": 500, "easing": "linear"},
    {"sourceSnapshotId": 17, "value": 10, "travelMs": 4000, "holdMs": 500, "easing": "linear"}
  ]
}
```

Схема вище — **ілюстрація**, не готовий контракт; `baseExperiment` у реалізації має бути валідованим об'єктом, а не рядком. Для Camera mode `value` замінюється камерою/pose. Записувати базис + змінні кадрів достатньо, але при створенні проєкту **матеріалізувати** стан снапшотів, а не покладатися тільки на їхні локальні ID. `sourceSnapshotId` — походження, не критична залежність. Так проєкт переживе cleanup History, повторний імпорт і перенесення на інший комп'ютер.

Зберігати існуючі `cameraSequence` при імпорті старого експерименту; запропонувати явну одноразову команду «Import old Camera Animation» і не змінювати його схему заднім числом.

## 6. Playback і рендеринг

- Винести обчислення стану у чисту функцію `sampleAt(project, timeMs)` без DOM/побічних ефектів.
- Режим перегляду має використовувати **тимчасову копію** стану/рендер-моделі; зупинка/Cancel не змінюють поточний експеримент. Окремо можна дати явну дію «Apply this frame to Scene/Compare».
- Під час playback вимкнути auto-history і session autosave для проміжних семплів; не дозволяти автозапис 1000 проміжних станів.
- `requestAnimationFrame` у поточному інструменті вже семплює за абсолютним часом, але `requestAutoCameraPreview()` допускає нечасті кадри, а `Fast` підтримує не всі моделі. Для градієнта потрібне окреме вимірювання Accurate-рендерингу.
- Для інтерактивного перегляду дозволити пропуск відрендерених кадрів, але ніколи не представляти застаріле зображення як новий фізичний стан. Для експорту — незалежний цикл `frame_i = render(sampleAt(i/fps))` без залежності від wall-clock; обмежений пул пам'яті, за потреби потік PNG/WebP у ZIP чи закодоване відео.
- Не використовувати мініатюри History як кінцеві відеокадри.

У браузері `requestAnimationFrame` зазвичай зупиняється у прихованій вкладці (MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame). Для кадрів з контрольованими timestamp придатний WebCodecs `VideoEncoder`, але сумісність браузера та формування контейнера треба перевірити окремо (W3C: https://www.w3.org/TR/webcodecs/ ; MDN https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API).

## 7. Необхідні експерименти перед великою реалізацією

1. **Correctness**: Scene Camera, Compare Camera, Globe→Flat з κ=0, Globe R₁→R₂, gradient −6.5→+10; порівняти середні та кінцеві кадри з прямим ручним розрахунком стану. Pixel parity важливіша за «гарне» відео.
2. **Compatibility matrix**: випадки «лише камера», «лише градієнт», «лише кривина», «камера + градієнт» (помилка), «кривина + градієнт» (помилка), «змінені об'єкти» (помилка), зміни неактивних параметрів (ігнорувати), різні Scene/Compare (помилка), кілька сегментів із різними channel (помилка).
3. **Browser performance**: на тих самих сюжетах заміряти p50/p95 часу повного кадру й пропускної здатності у Scene/Compare при 480p, 720p і 1080p, з `vacuum`, `standard`, `temperature-lapse`; перевірити оптимізацію повторного використання кешів лише якщо вона не спотворює оптику.
4. **State isolation**: Play/Pause/Seek/Stop, перемикання вкладки, F5, видалення джерельного снапшота, імпорт у новий IndexedDB не повинні модифікувати робочу фізику чи ламати проєкт.
5. **Deterministic export**: два рендери однієї часової точки дають ідентичний фізичний стан і порівнянний результат; розмітка часу і межі сегментів точні.

## 8. Рекомендований план компатчів

1. **#140.12.120.1 — AnimationCompatibility**: чисті diff/validate/sample, модель проєкту, багатокадрові інваріанти, тестова матриця. Без нового великого UI.
2. **#140.12.120.2 — Studio Editor**: єдина послідовність кадрів зі снапшотів, показ причин несумісності, параметр/режим, тривалість і порядок. Імпорт попередньої Camera Animation.
3. **#140.12.120.3 — Isolated Camera Playback**: повторне використання чинного інтерполятора; захист робочої сесії та історії.
4. **#140.12.120.4 — Physical parameter playback**: спершу Temperature gradient з Accurate CPU, потім curvature (включно Flat), за умови успішної числової та візуальної перевірки.
5. **#140.12.120.5 — Persistence/Export + perf**: IndexedDB, переносні JSON-проєкти, скрупульозний benchmark і прототип покадрового експорту; консолідація старого інтерфейсу без його втрати.

**Межа дослідження:** наявні модулі та 31 чинний unit/integration test перевірено; повноцінний новий валідатор, вимірювання FPS у реальному браузері, продукційний UI та код анімації фізики ще не реалізовані. Жодних комітів не створювалося.


## 9. Реалізований фундамент після #140.12.120.1

У цьому компатчі створені **чисті** JavaScript-модулі без UI, IndexedDB,
оптичного рендерингу та змін поточної Camera Animation:

- `src/animation/ModernAnimationCompatibility.js`: `inspect(experiments, {mode?, target?})`
  аналізує **всі** повні валідовані v1-експерименти відносно першого
  кадру та повертає `{compatible, mode, target, changedPaths, issues}`.
  Причини несумісності містять машинно-читані `code` і `path` для майбутнього UI.
  `effective(experiment)` бере активні фізичні ознаки через
  `ModernExperimentFingerprint` і зберігає критичні інваріанти композиції,
  камери та видимості. Неактивні поля Flat/Vacuum і службова інформація
  (History ID, назва, preset, старі Camera Sequence) не впливають на вибір
  фізичного каналу. Якщо жодна величина не змінюється, треба явно задати mode;
  неоднозначний режим не вгадується.
- `src/animation/ModernAnimationProject.js`: `create(snapshots, options)`,
  `validate(project)`, `timeline(project)`, `totalMs(project)`,
  `sampleAt(project, timeMs)`. `create` приймає повні снапшоти або History
  entries з полем `experiment`; обов’язковий наданий викликачем унікальний
  `options.id`. Project v1 зберігає **власну повну копію** `baseExperiment`
  та дозволені числові значення або позу камери для 2–200 keyframes;
  `sourceSnapshotId` — лише необов'язковий слід походження.
  `validate` повертає глибоко заморожену власну копію. `sampleAt` працює за
  абсолютним часом, повертає новий валідований ExperimentState v1 і не
  мутує дані проєкту чи робочу модель. Часова семантика відповідає чинній
  Camera Sequence: `travelMs` — перехід **до** ключового кадру, `holdMs` —
  пауза **після** прибуття; перший `travelMs=0`.

Контракт v1 для фізичних каналів:

```json
{
  "version": 1,
  "id": "gradient-study-1",
  "name": "Gradient study",
  "description": "",
  "mode": "physical",
  "target": {"scope": "scene", "parameter": "temperatureProfile.gradientKPerKm"},
  "baseExperiment": "<повний валідований ExperimentState v1, не рядок>",
  "keyframes": [
    {"sourceSnapshotId": 12, "name": "Standard lapse", "value": -6.5,
     "travelMs": 0, "holdMs": 500, "easing": "linear"},
    {"sourceSnapshotId": 17, "name": "Inversion", "value": 10,
     "travelMs": 4000, "holdMs": 500, "easing": "linear"}
  ]
}
```

Для `mode: "camera"` поле `target` мусить дорівнювати `null`, а `value`
кожного кадру — повна дев'ятипараметрична поза камери. Для Compare
`scope` фізичного каналу — `A` **або** `B`, а другий viewport залишається
незмінним. При `surface.curvature` значення є кривиною у `1/м`; `0` —
**точна** Flat, а скінченний додатний параметр представляється через `1/κ`.
Якщо на проміжній точці радіус виходить за допустимі межі збереженого
ExperimentState (наприклад, поблизу Flat за початкового R=10^16 м),
семплювання **явно відхиляється**, а не мовчки насичується. Це граничний
випадок для окремого дослідження рендерингових адаптерів.

`create` є єдиною точкою, що перевіряє **повні стани всіх снапшотів**.
`validate` перевіряє вже компактний і самодостатній проєкт, тому його
коректність стосовно вихідних снапшотів забезпечується шляхом створення.
Редагування фізики через майбутній UI мусить повторно проходити цю валідацію.

**Не реалізовано в #140.12.120.1:** редактор, збереження проєктів в IndexedDB,
імпорт старих Camera Animation, live playback, GPU/CPU-рендер кадрів,
вимірювання FPS, PNG/відео-експорт. Зокрема, успішний `sampleAt`
підтверджує коректність підстановки параметрів, **не** піксельну
еквівалентність готового рендеру — її потрібно перевірити окремо.


## Implementation update — Animation workspace restructure

After the core compatibility/model layer and compact Studio editor, the Studio
was moved from the expandable History panel to its own **Animation** workspace.
`state.mode` remains strictly `scene`/`compare` (or the existing Demos special
case); UI selection of Animation only changes workspace visibility and a
separate `workspace.mode` preference. It does not become a physical mode or
produce new render/history events. History is a bounded overlay that can be
opened from any workspace. Selected History cards are transferred to the
editor using stable local IDs, while the project/draft owns validated copies
of experiment data. A compact staging counter replaces the duplicate shortlist
strip. The Studio presents the selected History thumbnail; it is not a live
render. Animation playback remains separate future work.


## Implementation update — Isolated Camera Playback

`src/animation/ModernAnimationPlayback.js` is a deterministic absolute-time
clock over an immutable `ModernAnimationProject` v1. Its `start`, `tick`,
`pause`, `seek`, `stop`, `sample` and `status` API works without a DOM or
mutations of the source experiment. Playback is currently **camera-only**;
physical interpolation remains mathematically available from
`ModernAnimationProject.sampleAt` but does **not** have a live player yet.

`src/animation/ModernAnimationPreview.js` maps validated sampled experiments
to **dedicated** `CurveAppClass` instances. Scene uses one viewport and Compare
uses independent A and B viewports with a common camera. It passes their own
`CurvaturePhysicalSceneOptics.create()` cache sessions into the existing
`CurvatureMainCanvasRenderer.renderPhysical`, with the Canvas backend. No
Scene/Compare model, canvas, mutable UI state, URL, session storage or History
write is involved. GraphX3DX requires parser-time `document.writeln` for its
canvases: the distinct preview graphs are created in a fixed-width off-screen
bootstrap element and moved into Animation only for rendering.

**Performance/accuracy boundary:** a 120 ms minimum spacing between requested
preview redraws limits work; this is not a promised FPS. Playback time follows
the monotonic clock rather than the number of optical redraws, therefore
intermediate display frames can be skipped. The approximation-capable profiles
use Fast Preview, visibly labeled as such. Temperature-lapse and other
unsupported fast profiles use Accurate optics even if slow, rather than a
scientifically misleading approximation. Leaving Animation or hiding the tab
pauses playback; changing the draft discards its prepared player. The old
Camera Animation player is unaffected. Browser pixel/FPS validation and
permanent Animation Project storage remain outstanding.
