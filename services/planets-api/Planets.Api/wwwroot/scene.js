(() => {
  const canvas = document.getElementById("system-canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  const palettes = {
    neutral: ["#dbe7e8", "#8ba7ad", "#334d5c"],
    rocky: ["#e5ba8d", "#a97255", "#513d3d"],
    cloudy: ["#f2e4d0", "#a9bac1", "#556c7b"],
    icy: ["#e9f8f5", "#91c7cf", "#3c728c"]
  };
  let planet = null;
  let appearance = "neutral";
  let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let yaw = -.4;
  let elevation = .67;
  let phase = .7;
  let lastFrame = 0;
  let dragging = null;

  const playButton = document.getElementById("scene-play");
  function updatePlay() {
    playButton.textContent = playing ? "Пауза" : "Запустить";
    playButton.setAttribute("aria-pressed", String(playing));
  }
  updatePlay();
  playButton.addEventListener("click", () => { playing = !playing; updatePlay(); });

  document.querySelectorAll("[data-appearance]").forEach(button => button.addEventListener("click", () => {
    appearance = button.dataset.appearance;
    document.querySelectorAll("[data-appearance]").forEach(item =>
      item.setAttribute("aria-pressed", String(item === button)));
    updateAppearanceNote();
    draw();
  }));

  canvas.addEventListener("pointerdown", event => {
    dragging = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
    yaw += (event.clientX - dragging.x) * .009;
    elevation = Math.max(.14, Math.min(1.4, elevation + (event.clientY - dragging.y) * .006));
    dragging = { x: event.clientX, y: event.clientY };
    draw();
  });
  canvas.addEventListener("pointerup", () => { dragging = null; });
  canvas.addEventListener("pointercancel", () => { dragging = null; });

  function updateAppearanceNote() {
    if (!planet) return;
    const density = planet.densityGramsCm3;
    const hint = density == null ? "Плотность неизвестна, состав не оценён." :
      density >= 4 ? "Высокая плотность совместима с каменистым составом." :
      density < 2 ? "Низкая плотность допускает газовую или богатую летучими веществами оболочку." :
      "Плотность допускает разные варианты состава.";
    document.getElementById("appearance-note").textContent =
      `Художественная гипотеза: ${hint} Цвет и поверхность не измерены.`;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }
  new ResizeObserver(resize).observe(canvas);

  function draw() {
    if (!planet) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#102633";
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 38; i++) {
      const x = ((i * 137.51 + 29) % 1000) / 1000 * width;
      const y = ((i * 67.37 + 101) % 1000) / 1000 * height;
      context.fillStyle = i % 4 === 0 ? "#718c9a" : "#4d6978";
      context.fillRect(x, y, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }

    const a = planet.semiMajorAxisAu > 0 ? planet.semiMajorAxisAu : 1;
    const e = Math.min(.95, Math.max(0, planet.eccentricity ?? 0));
    const luminosity = a * a * Math.max(.001, planet.fluxEarth || 1);
    const outer = Math.sqrt(luminosity / planet.optimisticOuterFlux);
    const inner = Math.sqrt(luminosity / planet.optimisticInnerFlux);
    const conservativeOuter = Math.sqrt(luminosity / planet.conservativeOuterFlux);
    const conservativeInner = Math.sqrt(luminosity / planet.conservativeInnerFlux);
    const extent = Math.max(outer, a * (1 + e)) * 1.12;
    const scale = Math.min(width * .42, height * .43) / extent;
    const centerX = width / 2;
    const centerY = height / 2;

    function project(x, z) {
      const across = x * Math.cos(yaw) + z * Math.sin(yaw);
      const depth = -x * Math.sin(yaw) + z * Math.cos(yaw);
      const perspective = 1 / (1 + depth * Math.cos(elevation) / extent * .28);
      return [centerX + across * scale * perspective,
        centerY + depth * Math.sin(elevation) * scale * perspective, perspective];
    }
    function circle(radius) {
      for (let i = 0; i <= 120; i++) {
        const angle = 2 * Math.PI * i / 120;
        const [x, y] = project(radius * Math.cos(angle), radius * Math.sin(angle));
        if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
    }
    function band(outerRadius, innerRadius, color) {
      context.beginPath();
      circle(outerRadius);
      circle(innerRadius);
      context.fillStyle = color;
      context.fill("evenodd");
    }
    band(outer, inner, "rgba(197, 151, 100, .14)");
    band(conservativeOuter, conservativeInner, "rgba(87, 190, 166, .25)");

    context.beginPath();
    for (let i = 0; i <= 180; i++) {
      const angle = 2 * Math.PI * i / 180;
      const [x, y] = project(a * (Math.cos(angle) - e), a * Math.sqrt(1 - e * e) * Math.sin(angle));
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.strokeStyle = "rgba(230, 242, 238, .82)";
    context.lineWidth = 1.5;
    context.stroke();

    const starColor = planet.stellarTemperatureK < 3800 ? "#f6a77d" :
      planet.stellarTemperatureK < 5200 ? "#ffd3a0" :
      planet.stellarTemperatureK < 6500 ? "#fff0c6" : "#d6e9ff";
    const starRadius = 11 + Math.min(12, Math.sqrt(Math.max(0, planet.stellarRadiusSolar || .3)) * 6);
    const glow = context.createRadialGradient(centerX, centerY, 2, centerX, centerY, starRadius * 4);
    glow.addColorStop(0, starColor);
    glow.addColorStop(.18, starColor + "aa");
    glow.addColorStop(1, "#10263300");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(centerX, centerY, starRadius * 4, 0, 2 * Math.PI);
    context.fill();
    context.fillStyle = starColor;
    context.beginPath();
    context.arc(centerX, centerY, starRadius, 0, 2 * Math.PI);
    context.fill();

    let eccentricAnomaly = phase;
    for (let i = 0; i < 6; i++) eccentricAnomaly -=
      (eccentricAnomaly - e * Math.sin(eccentricAnomaly) - phase) / (1 - e * Math.cos(eccentricAnomaly));
    const [px, py, factor] = project(a * (Math.cos(eccentricAnomaly) - e),
      a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly));
    const radius = (10 + Math.min(7, Math.sqrt(Math.max(.5, planet.radiusEarth || 1)) * 3)) * factor;
    const [light, base, dark] = palettes[appearance];
    const surface = context.createRadialGradient(px - radius * .35, py - radius * .4, 1,
      px, py, radius * 1.12);
    surface.addColorStop(0, light);
    surface.addColorStop(.52, base);
    surface.addColorStop(1, dark);
    context.fillStyle = surface;
    context.beginPath();
    context.arc(px, py, radius, 0, 2 * Math.PI);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.7)";
    context.lineWidth = 1;
    context.stroke();

    context.font = "12px Avenir Next, Segoe UI, sans-serif";
    context.fillStyle = "#dbe9e8";
    const planetLabelWidth = context.measureText(planet.name).width;
    context.fillText(planet.name, Math.max(8, Math.min(px + radius + 7, width - planetLabelWidth - 8)),
      Math.max(18, py - radius - 8), width - 16);
    context.fillStyle = "#adc7c9";
    const hostLabel = planet.hostName || "Звезда";
    context.fillText(hostLabel, Math.max(8, centerX - starRadius - context.measureText(hostLabel).width - 8),
      centerY + starRadius + 15, width - 16);
  }

  function frame(now) {
    if (playing && document.visibilityState === "visible" && planet && lastFrame)
      phase = (phase + Math.min(now - lastFrame, 80) * .00025) % (2 * Math.PI);
    lastFrame = now;
    if (playing) draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.ExoScene = {
    setPlanet(value) {
      planet = value;
      phase = .7;
      const orbitNote = value.eccentricity == null ? " Эксцентриситет неизвестен: орбита условно круговая." : "";
      document.getElementById("scene-data-note").textContent =
        value.semiMajorAxisAu > 0
          ? `Орбита: ${value.semiMajorAxisAu.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} а.е. · размеры тел увеличены для видимости.${orbitNote}`
          : `Размер орбиты неизвестен · показана условная схема. Размеры тел увеличены.${orbitNote}`;
      updateAppearanceNote();
      draw();
    }
  };
})();
