import { useState } from "preact/hooks";
import { api } from "../api/endpoints";
import type { Candidate } from "../api/types";
import { ZoneStrip } from "../charts/Detail";
import { Loading } from "../components/ui";
import { num, sig } from "../lib/format";
import { useResource } from "../lib/hooks";
import { ZONE_LABEL } from "../lib/science";
import { Link } from "../router";

/** Учебный опыт «передвинуть планету»: поток меняется как 1/d², рейтинг не пересчитывается. */
function FluxExperiment({ candidates }: { candidates: Candidate[] }) {
  const [name, setName] = useState(candidates[0]?.name ?? "");
  const [factor, setFactor] = useState(1);
  const base = candidates.find((c) => c.name === name) ?? candidates[0];
  if (!base) return null;
  const flux = base.fluxEarth / (factor * factor);
  const zone = flux >= base.conservativeOuterFlux && flux <= base.conservativeInnerFlux ? "conservative" : flux >= base.optimisticOuterFlux && flux <= base.optimisticInnerFlux ? "optimistic" : "outside";
  const moved: Candidate = { ...base, fluxEarth: flux, name: `${base.name} на ${num(factor, 2)} расстояния` };
  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div class="toolbar" style={{ marginBottom: 0 }}>
        <label class="field__label" for="flux-planet">
          Планета
        </label>
        <select id="flux-planet" class="select" style={{ width: "auto" }} value={name} onChange={(e) => setName((e.target as HTMLSelectElement).value)}>
          {candidates.slice(0, 40).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="flux-factor">
          Расстояние до звезды: ×{num(factor, 2)} от настоящего
        </label>
        <input id="flux-factor" type="range" min={0.5} max={2} step={0.01} value={factor} onInput={(e) => setFactor(Number((e.target as HTMLInputElement).value))} />
      </div>
      <ZoneStrip
        candidate={moved}
        domain={[Math.max(base.optimisticInnerFlux, base.fluxEarth * 4, 1) * 1.3, Math.min(base.optimisticOuterFlux, base.fluxEarth / 4, 1) / 1.3]}
      />
      <p class="prose">
        Поток S = S₀ / k² = {sig(base.fluxEarth)} / {num(factor, 2)}² = <strong>{sig(flux)} S⊕</strong>: планета оказалась бы {ZONE_LABEL[zone as keyof typeof ZONE_LABEL]}. Температура звезды и границы зоны не меняются. Это не
        пересчёт климата и не меняет реальный балл в рейтинге.
      </p>
    </div>
  );
}

export function Experiments() {
  const candidates = useResource(() => api.candidates(), []);
  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Эксперименты</h1>
        <p class="lead">Интерактивные модели, на которых можно проверить физику руками. Они не меняют научный рейтинг и не выдаются за наблюдения.</p>
      </header>
      <section class="section grid-2">
        <article class="experiment">
          <h2>
            <Link href="/experiments/three-body">Задача трёх тел</Link>
          </h2>
          <p class="prose">
            Восьмёрка, треугольник Лагранжа, задача Пифагора и ещё четыре периодические орбиты. Можно перетаскивать тела, запускать двойника с отклонением в миллиардную долю и смотреть, как растёт расхождение и
            насколько точно сохраняется энергия.
          </p>
          <p>
            <Link class="btn btn--primary" href="/experiments/three-body">
              Открыть модель
            </Link>
          </p>
        </article>
        <article class="experiment">
          <h2>Если передвинуть планету</h2>
          <p class="prose muted" style={{ marginBottom: "16px" }}>
            Учебный сценарий по мотивам занятия astroEDU «The Engine of Life»: как меняется поток при изменении расстояния до звезды.
          </p>
          {candidates.data ? <FluxExperiment candidates={candidates.data.items} /> : <Loading />}
        </article>
      </section>
    </div>
  );
}
