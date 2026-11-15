# Сторонний код и шрифты в портале

## formula-to-pixel — MIT

Ядро задачи трёх тел (`src/experiments/threebody/physics.ts`: уравнения в векторах сторон, интегратор Грэгга — Булирша — Штёра, начальные условия периодических орбит и численные проверки) адаптировано из [formula-to-pixel](https://github.com/KaiyuanGONG/formula-to-pixel), файлы `src/core/20-nb.js` и `src/core/90-tests.js`. Интерфейс, визуализация и тексты написаны для портала заново; страница formula-to-pixel целиком не используется.

```
MIT License

Copyright (c) 2026 Kaiyuan Gong

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Начальные условия орбит восходят к публикациям: C. Moore (1993), A. Chenciner, R. Montgomery (2000), M. Šuvakov, V. Dmitrašinović (2013), C. Burrau (1913).

## Зависимости сборки

| Пакет | Версия | Лицензия |
| --- | --- | --- |
| preact | 11.2.0 | MIT |
| d3-array, d3-format, d3-quadtree, d3-scale, d3-shape | 3.2.5, 3.1.3, 3.0.2, 4.0.3, 3.2.1 | ISC |
| @fontsource-variable/inter (шрифт Inter) | 5.3.0 | SIL Open Font License 1.1 |
| @fontsource-variable/public-sans (шрифт Public Sans) | 5.3.0 | SIL Open Font License 1.1 |
| @fontsource/dm-mono (шрифт DM Mono) | 5.3.0 | SIL Open Font License 1.1 |

Шрифты включаются в сборку из пакетов Fontsource и не загружаются со сторонних серверов. Тексты лицензий лежат в соответствующих пакетах в `node_modules` после `npm ci`.
