# Tasks

План реализации существующего change; на этапе proposal ни одна задача ниже не выполнена. Контракт — [disk-monitoring](specs/disk-monitoring/spec.md), технические решения и матрица проверок — [design.md](design.md). Выполнять по порядку; публикация и изменение окружения не разрешаются самим наличием этого списка.

## 1. Подготовка реализации

- [x] 1.1 Проверить `git status --short --branch -uall`, актуальность целевых файлов и наличие проектных зависимостей; сохранить чужие изменения. Если `node_modules` отсутствует, получить отдельное разрешение на `bun install --frozen-lockfile`. Проверка завершения: `bun run typecheck` проходит без TS2688, `package.json` и `bun.lock` не изменены; без разрешения/успешной проверки остановиться с blocker.

## 2. Регрессионные тесты и минимальное исправление

- [x] 2.1 Добавить `test/fixtures/linux-wsl2-df.txt` с реальным header и строкой WSL2 `df`, приведёнными в design; проверить, что `parseDf()` получает mount, `used=98720*1024`, `available=0`, а fixture не содержит UUID, серийных номеров или пользовательских путей.
- [x] 2.2 В `test/parsers.test.ts` добавить случаи исключения исходного WSL2 mount и синтетической другой версии ядра при `container=false/true`, сохраняя обычный root или overlay `/`. Добавить положительные случаи обычного диска 100% и близких несовпадений из design, включая пустую часть `<kernel>`; проверить точные списки сохранённых mounts и объёмы, чтобы пустой результат не проходил тест.
- [x] 2.3 В `test/parsers.test.ts` добавить две коллизии: одинаковое устройство и одинаковые figures разных устройств. В каждой проверить, что обычный mount длиннее служебного и сохраняется при обоих порядках строк; до исправления тесты должны обнаруживать потерю обычного mount либо присутствие служебного.
- [x] 2.4 В `test/sampler.test.ts` подключить результат `linuxDisks(parseDf(...))` к существующему harness для двух сценариев из design: здоровый `/` + WSL и здоровый `/` + полный `/data` + WSL. Проверить `snapshot.disks.items`, `fullestDisk`/процент, точный массив `warnings` и длину 0/1; прочие ресурсы не должны создавать предупреждений.
- [x] 2.5 Выполнить `bun test test/parsers.test.ts test/sampler.test.ts` до изменения production-кода и записать red-результат: новые WSL-сценарии падают из-за ошибочного списка/предупреждения, а не из-за синтаксиса, imports или окружения. При иной причине сначала исправить тест/окружение, не менять фильтр вслепую.
- [x] 2.6 Расширить только существующий `LINUX_HIDDEN_MOUNT` в `src/service/collectors/parse-disks.ts` точным семейством из design до дедупликации; выполнить те же targeted-тесты до green и `bun run build` после source-изменения. Проверить diff: нет критериев по read-only/100%, новой WSL-детекции, изменений порогов, API, дедупликации или downstream UI-логики.

## 3. Интеграционная проверка и пакет

- [x] 3.1 Выполнить `bun run check`, сохранить exit code и итог typecheck/tests/build; проверить, что свежий `dist/` включён в diff реализации, а сторонние файлы и зависимости не изменены. Не считать check успешным при неудаче любого его этапа.
- [x] 3.2 Выполнить `node scripts/smoke.mjs` и `SMOKE_RUNTIME=bun node scripts/smoke.mjs` на WSL2 с исходным служебным mount. Проверка завершения: оба процесса завершаются с кодом 0 и `SMOKE OK`, их JSON не содержит исключаемых mounts в `disks.items` или `warnings`; настоящие предупреждения не подавлены.
- [x] 3.3 Перезапустить сервис обновлённого расширения в OpenChamber и проверить список дисков, компактный максимум, критический баннер и badge по критериям design; не заполнять диски и не менять mounts ради проверки. Записать наблюдаемые результаты, а при недоступном UI оставить задачу незавершённой с blocker. Read-only обычный том проверять вручную только при наличии подходящего существующего mount; отсутствие такой аппаратной проверки отметить явно.
- [x] 3.4 Проверить результаты существующей CI-матрицы Ubuntu/macOS/Windows, Node/Bun smoke и ограниченного Linux container для реализации, не меняя workflow и не запуская внешние операции без разрешения. Проверка завершения: соответствующие job успешны; если результаты/доступ отсутствуют, оставить задачу незавершённой и отдельно указать непроверенные платформы.
- [x] 3.5 Проверить доступность `crapper`, `dryer`, `mutator` в окружении и проекте: при наличии применить к изменённому коду (CRAP < 10, оценка дублирования от 0.8, анализ выживших мутантов), иначе явно записать непроведённые проверки без установки. Повторно выполнить `openspec validate fix-wsl2-system-mount-disk-monitoring --strict` и проверить итоговый `git diff --check`; не отмечать реализацию завершённой при незакрытых обязательных проверках.

## Verification record (2026-11-02)

- Подготовка: пользователь отдельно разрешил `bun install --frozen-lockfile`; установка и `bun run typecheck` завершились с кодом 0. `package.json` и `bun.lock` не изменены.
- RED: `bun test test/parsers.test.ts test/sampler.test.ts` на старом фильтре — 45 pass / 10 fail, exit 1. Все падения относятся к присутствию служебного mount или вытеснению обычного mount; родитель независимо повторил результат. Полный временный журнал: `/tmp/opencode/wsl2-disks-red.log`.
- GREEN: та же targeted-команда после минимального фильтра — 55 pass / 0 fail, exit 0; затем `bun run build` — exit 0. Удалены новые non-null assertions в тестах; после этого `bun run check` — typecheck, 79 pass / 0 fail и build, общий exit 0. Журнал: `/tmp/opencode/wsl2-disks-check.log`.
- Live WSL2: Node 26.13.0 и Bun 1.4.4 smoke — оба `SMOKE OK`, exit 0; оба JSON содержат только обычный диск `/` и пустой `warnings`, хотя служебный mount остаётся в системе. Журналы: `/tmp/opencode/wsl2-disks-smoke-node.log`, `/tmp/opencode/wsl2-disks-smoke-bun.log`. Это не утверждение о Node 22 или других ОС.
- Покрытие: `bun test --coverage` — 79 pass, exit 0; `parse-disks.ts` имеет 100% line coverage. `crapper`, `dryer`, `mutator` не найдены в PATH, `node_modules/.bin` или файлах проекта: CRAP, оценка дублирования и mutation testing не выполнялись; инструменты не устанавливались.
- Scope/review: production-diff — одна альтернатива в существующем Linux regexp и соответствующая строка `dist/service/main.js`; тесты и fixture проверены родителем. Независимый read-only reviewer не обнаружил проблем по коду/spec, но не перезапускал проверки и не смог самостоятельно получить git diff. Пороги, API, остальные платформенные ветки и metadata не менялись.
- Приёмка OpenChamber: пользователь предоставил адрес настоящего web host и возобновил Browser MCP. В Settings → Extensions подтверждён Folder-source `/home/dev/code/personal/projects/openchamber-system-monitor`, v1.0.2, Enabled. Процесс сервиса из этого checkout стартовал 09:20:05 +0300 после пересборки bundle 09:05:40 +0300 (перезапуск серверной сессии уже загрузил новый код, повторное отключение расширения не требовалось). Accessibility snapshots настоящих panel/status frames показывают только `/` около 6%, без служебного mount и критического баннера; после закрытия панели у кнопки System Monitor нет badge. Обычный read-only том отдельно на оборудовании не проверен. Preview повторно не запускался.
- Артефакты: `openspec validate fix-wsl2-system-mount-disk-monitoring --strict` и `git diff --check` — exit 0. Все 12 implementation-задач выполнены; недоступные необязательные инструменты качества и отдельная аппаратная проверка обычного read-only тома отмечены выше, а не выданы за проведённые проверки.

### CI verification

- Реализация опубликована коммитом `820ef9f` в [PR #1 своего fork](https://github.com/Vnuchoke/openchamber-system-monitor/pull/1), ветка `fix/wsl2-system-mount-disk-monitoring`, base `main`. GitHub первоначально блокировал workflows в fork; пользователь отдельно разрешил их включение, выполненное штатной кнопкой GitHub. AccessLint не использовался как замена проектному CI.
- [CI run 41401356374](https://github.com/Vnuchoke/openchamber-system-monitor/actions/runs/41401356374) для `7ee768d44a9fd2824840d6e3542a2ecdb8a49a39` завершился `success`: Ubuntu, macOS и Windows прошли typecheck/tests/build и оба smoke под Node 22/Bun; Ubuntu дополнительно подтвердил актуальность `dist/`. `Linux container with limits` успешно выполнил build и smoke с заданными CPU/memory limits. Все четыре job и их необходимые шаги независимо сверены через `gh run view`.
- После implementation-коммита менялся только журнал OpenSpec; идентичность `src/`, `test/`, `dist/`, manifest/lockfile и workflow проверена `git diff --exit-code 820ef9f HEAD -- src test dist package.json bun.lock .github/workflows/ci.yml`. Upstream, `main` и файл workflow не менялись; merge не разрешён. Новые untracked каталоги агентских инструментов не включались в коммиты. Локальный Docker-образ не загружался.

## Workflow follow-up

- После реализации и приёмки рассмотреть архивирование change отдельным действием; на planning-этапе не архивировать и не отмечать implementation-задачи выполненными.
- Коммиты, push, обновление версии, tag и release выполнять только по отдельному разрешению; при будущем коммите реализации включить сгенерированный `dist/`.
