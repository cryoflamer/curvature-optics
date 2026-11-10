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
mutations of the source experiment. At #140.12.120.3, playback was **camera-only**. Physical playback was
subsequently enabled in #140.12.120.4, as described below.

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
Camera Animation player is unaffected. Browser pixel/FPS validation remains outstanding; named project storage
was subsequently added in #140.12.120.5.1.


## Implementation update — Physical Parameter Playback (#140.12.120.4)

The isolated `ModernAnimationPlayback` clock now accepts both validated modes
(`camera` and `physical`), without adding a second timing engine.
The Animation workspace previews a sampled `ModernAnimationProject` state
through the **same independent physical renderer** used by camera playback.
Physical mode supports a single active target channel across the whole project:
`surface.curvature` (including exact Flat at κ = 0) **or**
`temperatureProfile.gradientKPerKm` for a fixed `temperature-lapse` atmosphere.
In Compare, only the chosen A/B model changes and both views retain their
common fixed camera. The preview identifies the current radius/Flat state or
temperature gradient; this is true physics sampling, not a crossfade.

The editor's Prepare project action now enables Play/Pause/Stop/Seek for
compatible physical projects. Source History and live Scene/Compare are not
modified, and a new draft invalidates the prepared player. Accurate optics
are used for temperature-lapse; other profiles retain the existing explicit
Fast Preview/Accurate selection. The 120 ms preview redraw throttle and
clock-driven frame skipping still apply. Export, persistent projects, and
real-browser pixel/FPS tests remain outstanding.

**Near-flat caveat:** sampled curvature is validated against the existing
ExperimentState representation. Extremely large implied radii beyond its
supported bound produce a clear playback error rather than silently
substituting Flat or altering the physics.

## Rendering diagnostics and parity with Scene (#140.12.120.4.1)

The original isolated `ModernAnimationPreview` passed a sampled experiment to
`CurvatureMainCanvasRenderer.renderPhysical`, but did not draw Modern's
screen-space Eye level and Traced horizon overlays. Those annotations are **not**
physical objects and must be painted *after* optical composition. The isolated
viewport now uses the same observer-angle projection and forward RK4
`CurvatureRayHorizon.diagnose()` calculation as Scene/Compare, with a horizon
cache owned separately by each preview side. It respects the snapshot's
`display.eyeLevel` and `display.horizon` flags. The horizon is **never**
replaced by an analytical geometric dip: an unresolved/ambiguous finite
first-contact diagnostic produces no fabricated line. Camera roll or an
out-of-view angle also suppresses that overlay, with an explicit diagnostic.
Exact traced horizon is disabled in Fast Preview, just as in the main view.

The optical-quality control in Animation supports **Auto** (qualified Fast for
camera motion; **Accurate RK4 by default for physical animation**), explicit
Accurate and opt-in approximate Fast for eligible atmospheres. An unsupported
Fast profile still uses Accurate rather than falsely claiming to render an
unsupported approximate model. Accurate renders use full object detail
(`previewLod.stride = 1`) and can be much slower, especially with an exact
horizon diagnostic and changing curvature. This is not a frame-rate promise.
The temperature column (another screen-space presentation layer) is not yet
ported to the independent Animation viewport.

The UI reports each frame's **sampled animation time**, elapsed render time,
actual quality per viewport and Eye level / Traced horizon status. The timeline
may be ahead of the most recently *rendered* sample when the synchronous RK4
calculation is slow; this discrepancy is displayed explicitly rather than
misrepresenting an old image as the current time. The deterministic clock still
skips frames when necessary. A 0.2 s sample of a 5 s linear Globe (6371 km)
→ Flat transition has radius `6371 / (1 - 0.2/5) ≈ 6636.46 km`; unit tests
confirm that project interpolation itself is correct. An apparent different
radius paired with that clock label in a screenshot is **not by itself proof**
of a faulty curvature formula. A real-browser pixel-parity/performance check
at identical saved Scene and Animation states is still required.

### Runtime Fast → Accurate recovery (#140.12.120.4.2)

Fast capability checks made from the profile name are only advisory: the
actual optical field builder may reject a geometry/profile combination after
the preview began. For example, `standard` on `globe` can be rejected by the
Fast ray-field implementation even when a coarse eligibility check accepted
it. This is a renderer capability mismatch, not an invalid animation state.

The isolated Animation viewport retries **only** the known `RangeError`
(`Fast Preview is unavailable for … on …; select Accurate (RK4).`) using
`opticalQuality: accurate` and full object detail. A per-preview-session
cache avoids repeated failed probes for the **same physical state**, including current Globe radius and camera height; a failure at one curvature cannot ban Fast for other radii.
Both the selected quality and the fallback count are diagnostic, and the
original project / working Scene / Compare are untouched. In Compare, if
model B falls back, model A is also redrawn Accurate to avoid silently
mixing approximations in that frame. Errors from the Accurate retry and all
unrelated rendering exceptions propagate rather than being swallowed.

At the end of the absolute-time sequence, the terminal sampled state is
rendered (including exactly Flat where applicable). Recovery does not
rewind the clock or change timing. Rendering may still be too slow for
smooth playback; browser verification of visual fidelity and completion is
required. Named Animation Library project storage was subsequently implemented in
#140.12.120.5.1.

## Editable Animation Studio checkpoint (#140.12.120.4.3)

The Studio editor now has a dedicated `ModernAnimationDraftAutosave` module,
separate from `ModernSessionAutosave` and History. It validates a versioned
checkpoint with the entire editable `ModernAnimationStudio` draft, not just
source History IDs: names, per-frame full `ModernExperimentState` values,
frame ordering, timing, easing, selection, optics quality, prepared flag,
and deterministic playback position in milliseconds. Incomplete drafts and
physically incompatible keyframes are valid *editable* checkpoints; only a
compatible prepared draft is rebuilt into `ModernAnimationProject` on restore.
The playback controller is always paused after restore. Rendering its paused
position is deferred until the Animation workspace becomes visible, avoiding
a hidden expensive RK4 redraw.

LocalStorage provides a synchronous pagehide/reload backup. A distinct
IndexedDB store contains the same self-contained record, with serialized
transaction writes and a short debounce. The newest validated timestamp
wins during startup. Async restore is generation-gated so an older record
that arrives after a new user edit cannot overwrite that edit. Updating
position during Play is throttled; Pause, Stop, Seek, editor mutations,
visibility changes and pagehide persist immediately locally. Corrupted or
unsupported versions are ignored. Browser storage failures are reported
without deleting existing History or replacing the working Scene/Compare.

There is still only *one* recoverable working draft; the separate multi-project
Animation Library was added in #140.12.120.5.1. Portable import/export is described below.

## Initial physical preview after Prepare / F5

A prepared project has a visible physical preview without requiring Play. The
independent GraphX3DX graphs are constructed in an off-screen bootstrap and
attached to the Animation workspace; rendering before that workspace has a
measurable layout can produce an empty/cleared Canvas even though the optical
solver reported a successful frame. The Animation UI therefore schedules an
initial render across two browser layout frames, waits for a nonzero viewport
width, and uses the exact saved `ModernAnimationPlayback.positionMs` from
`ModernAnimationDraftAutosave`. It **does not advance the clock**. The same
render path handles freshly prepared projects, restored drafts, return to the
Animation tab, and Stop (after resetting the clock to the first frame). Seek
continues to sample directly. A resize observer redraws paused frames if the
viewport width changes after their initial paint.

Pending redraws are generation-guarded and canceled by later state changes or
Play, so stale callbacks cannot paint the wrong project or timeline position.
The UI marks a frame as rendering until the real physical painter completes;
errors show a diagnostic and **Retry frame**, never a screenshot masquerading as
a valid interpolated physical result. The independent physical renderer and
its quality/fallback policy remain unchanged. There is no new persistence
format, no optical formula change, and no new History entry.

Automated tests exercise delayed startup, saved-position rendering, first-frame
Stop/Prepare wiring, cancellations, resizing, hidden workspaces and retries.
Actual Canvas visibility after Opera F5 still requires user-side verification.


## Paused-preview Canvas ownership after F5

The isolated `ModernAnimationPreviewGraph` uses a parser-time `GraphX3DX`
instance, but the Animation Studio calls the shared physical painter directly
through `ModernAnimationPreview.render()`. The graph must therefore **not** have
its own `DrawFunc` or a polling resize loop. A pending legacy `Draw()` runs
`AutoReset/AutoClear` before invoking the callback; when that callback was an
empty placeholder, it erased a successfully rendered paused frame a moment
later. This produced a white viewport even while diagnostics said the frame
was ready and reported nonzero optical segments.

The preview bootstrap now leaves `DrawFunc` unset, cancels pending legacy
draws, and stops the graph's independent resize polling. The physical painter
continues to call `UpdateCanvasSize()` synchronously **before** rendering, and
the Animation workspace's `ResizeObserver` schedules a new paused-frame render
when the viewport width changes. This preserves the correct dimensions without
allowing a second, unrelated drawing owner to clear the canvas after it has
been painted. The change is isolated to the Animation graphs; Scene/Compare
and the Legacy graph lifetime are unchanged.


## Recovering Fast Preview after varying curvature (#140.12.120.4.6)

Fast availability for the `standard` atmosphere on a Globe is **not** a
property of the two labels `standard + globe` alone. The production
`OpticalFastRayField` uses a local conformal logarithmic gradient; its
single-ray approximation is qualified only while that gradient is positive.
As Globe radius grows towards the Flat endpoint, the gradient can change
sign. The old fallback cache stored only profile and geometry, so one
near-Flat rejection incorrectly made all subsequent Globe frames Accurate,
including a return to the original Earth radius.

`ModernAnimationPreview` now asks the **existing production Fast field** to
qualify each `standard + globe` physical state before attempting Fast. A
nonqualified radius is rendered in Accurate RK4 with an explicit reason;
returning to a qualified radius is eligible for Fast again. Unexpected
runtime capability rejections are still retried in Accurate, but the
bounded cache is keyed by the **actual** geometry, radius, observer height,
and physical atmospheric settings rather than a broad label. Changing the
requested optics mode explicitly clears runtime failure memory and permits
a fresh Fast attempt. No unsupported state is forced into approximation.

The Animation diagnostics distinguish **requested** optics from the
**effective** frame quality, explaining when Fast was not available and
reporting only actual runtime fallback attempts. Compare A/B continues to
avoid mixing optical quality within a single frame. The physics,
interpolation, saved project format, and independent Scene/Compare remain
unchanged. Regression tests cover Fast → nonqualified curvature → Fast,
state-specific runtime failure memory, and retry on manual quality change.
A real-browser visual check in Opera is still necessary.


## Named Animation Library foundation (#140.12.120.5.1)

`ModernAnimationLibrary` provides a versioned IndexedDB `projects` store,
separate from the single `ModernAnimationDraftAutosave` checkpoint and from
History. The project schema remains the existing immutable
`ModernAnimationProject.VERSION === 1`: a saved project includes its owned
experiment, mode and single physical target (if applicable), keyframe values,
transition timings and easing. A library wrapper adds creation/update time,
quality preference and a persistent project ID; it does not depend on local
History records or snapshot thumbnails.

- `create(db, project, optics)`: atomic create-only save (existing IDs rejected).
- `get(db, id)` and `list(db)`: validated retrieval, newest updates first.
- `update(db, project, optics, expectedRevision)`: explicit, revision-checked
  overwrite to protect against cross-tab edits.
- `remove(db, id)`: delete only the named record; never delete current draft or History.
- `ModernAnimationStudio.fromProject(project)`: reconstruct independently
  editable keyframe experiments from the baseline and per-frame arrival times.

The Animation workspace offers Save animation / Save As / Save changes / Open /
Delete. Opening validates the entire record before replacing the draft and
starts prepared Playback *paused* at the first frame. Saving is explicit;
autosave remains scoped to the current editable draft and can restore the
associated library ID/revision after reload (old v1 checkpoints remain valid).
A stale revision or IndexedDB failure must produce a visible error, not a
false success message. No separate rendering engine is added.

## Visual Animation Library and rename (#140.12.120.5.2)

The saved-project list is a horizontally scrollable, collapsible gallery of
cards with Open / Select / Rename / Delete and summary data derived from the
immutable Animation Project. The card's duration is the sum of keyframe
travel and hold times; this is metadata, not playback rendering. Save, Save As
and Save changes remain explicitly tied to the current working draft.

Named library records may now carry an optional validated and bounded
`ModernExperimentThumbnail`. A screenshot is copied from History only if the
entire first-frame experiment matches the stored project's base experiment.
The library owns this copy, so deleting the source History entry does not
remove the screenshot. An absent screenshot is explicitly labeled as such;
there is no invented physical render, no additional ray calculation and no
requirement to retain History. Old IndexedDB records without `thumbnail`
normalize to `thumbnail: null`. Changes to the first frame invalidate the
previous screenshot unless a matching new one is available.

`ModernAnimationLibrary.rename(db, id, name, expectedRevision)` changes only
the saved project's name and update timestamp, preserving every physical
state, keyframe and existing thumbnail. It shares the optimistic revision
check used by Save changes. The draft remains independent: when its name
matches the previous saved name, it follows an explicit rename without
silently saving other draft modifications. Portable JSON import/export is supported by the library.

## Duplicate-aware Animation Library (#140.12.120.5.2.2)

`ModernAnimationLibrary.fingerprint(project)` serializes the **validated active
experiment** using `ModernAnimationCompatibility.effective`, animation mode,
physical target, and ordered keyframe values, travel/hold times and easing.
For camera-motion projects, the base camera is intentionally excluded: each
camera pose is already represented in a keyframe. The active scene or Compare
models, objects, display flags and fixed camera (physical mode) remain part
of identity. Inactive controls, provenance IDs, frame titles, project name,
notes, screenshot, revision, optics preference and playback cursor do not.

`create` checks existing fingerprints in the same IndexedDB `readwrite`
transaction as insertion. A matching project raises `ANIMATION_DUPLICATE`
with the existing ID/name. The UI offers Open existing, and an explicit
Save copy anyway action using the same current-draft fingerprint. Force-save
is never automatic. `findDuplicates` groups historical copies for manual
review; a group offers the existing Open/Delete actions with their normal
confirmation rules, never automatic cleanup. Stored schemas and animation
physics are unchanged. The JSON importer now reuses this fingerprint inside an atomic IndexedDB transaction.

## Portable Animation Library JSON (implementation)

`ModernAnimationLibrary.exportPortable(records)` produces a versioned
`curvature-modern-animations` JSON envelope containing 1–200 validated
library records (`project`, `quality`, optional `thumbnail`, `createdAt`,
`updatedAt`). The complete owned physical baseline and keyframe values are
embedded in each `ModernAnimationProject`. A standalone v1 Animation Project
can also be imported with default `auto` optics. The browser-facing toolbar
offers **Export selected**, **Export all** and **Import JSON**; no video frames,
wall-clock playback position or browser-local active draft are exported.

`parsePortable(contents)` rejects unknown envelopes and fields, invalid
projects, incompatible stored screenshots, bad timestamps or oversized JSON.
`importEntries(indexedDB, entries)` validates the **entire** file before
starting a single read-write IndexedDB transaction. Every record gets a fresh
local ID; source History IDs are cleared because they could otherwise refer to
unrelated snapshots on the destination machine. Full
semantic animation fingerprints are compared against persisted records and
against earlier entries within the same import, avoiding automatic duplicates.
The operation returns created/reused counts and never overwrites existing
records, alters the current working draft or modifies the optical renderer.

**Browser acceptance:** save a named Globe → Flat animation, export selected
and all, import into a separate local browser profile, open the imported
project, check endpoint physics and playback, then import the same file a
second time and confirm `0 created`. Confirm that a corrupt file leaves the
library untouched and that thumbnails only appear when genuine snapshots
were included. Automated tests verify the data and classic-browser UMD
boundary; they are not substitutes for checking Opera's file picker or downloads.


### Performance / pixel parity audit

The optional read-only diagnostic added after Animation Library is documented
in [`modern-animation-quality-audit.md`](modern-animation-quality-audit.md). It
measures actual isolated frame and optical phase timings and can compare live
Scene/Compare Canvas pixels only for precisely matching states, optics and
backing sizes; skipped checks are explicitly **not comparable**, not passing.
These measurements do not certify a final video exporter.
