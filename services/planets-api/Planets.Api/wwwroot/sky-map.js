(() => {
  const canvas = document.getElementById("sky-canvas");
  const context = canvas.getContext("2d");
  let planets = [];
  let selected = null;
  let groups = [];
  let focused = 0;
  let onSelect = () => {};

  const valid = planet => Number.isFinite(planet.rightAscensionDegrees) &&
    Number.isFinite(planet.declinationDegrees) && planet.declinationDegrees >= -90 &&
    planet.declinationDegrees <= 90;

  function project(ra, dec, width, height) {
    const margin = 24;
    return {
      x: margin + (360 - ra) / 360 * (width - margin * 2),
      y: margin + (90 - dec) / 180 * (height - margin * 2)
    };
  }

  function rebuild() {
    const byHost = new Map();
    for (const planet of planets.filter(valid)) {
      const key = planet.hostName || planet.name;
      if (!byHost.has(key)) byHost.set(key, { name: key, ra: planet.rightAscensionDegrees, dec: planet.declinationDegrees, planets: [] });
      byHost.get(key).planets.push(planet);
    }
    groups = [...byHost.values()];
  }

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0b2735");
    gradient.addColorStop(1, "#173c48");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(192, 223, 220, .17)";
    context.lineWidth = 1;
    for (const ra of [0, 60, 120, 180, 240, 300, 360]) {
      const x = project(ra, 0, width, height).x;
      context.beginPath(); context.moveTo(x, 24); context.lineTo(x, height - 24); context.stroke();
    }
    for (const dec of [-60, -30, 0, 30, 60]) {
      const y = project(0, dec, width, height).y;
      context.beginPath(); context.moveTo(24, y); context.lineTo(width - 24, y); context.stroke();
    }
    context.fillStyle = "rgba(225, 241, 238, .62)";
    context.font = "11px system-ui";
    context.fillText("0h", width - 47, height - 8);
    context.fillText("12h", width / 2 - 12, height - 8);
    context.fillText("24h", 31, height - 8);
    context.fillText("+90°", 4, 17);
    context.fillText("−90°", 4, height - 31);

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      const { x, y } = project(group.ra, group.dec, width, height);
      const active = group.planets.some(planet => planet.name === selected);
      const keyboardFocus = index === focused && document.activeElement === canvas;
      if (active || keyboardFocus) {
        context.beginPath(); context.arc(x, y, active ? 12 : 9, 0, Math.PI * 2);
        context.fillStyle = active ? "rgba(250, 207, 134, .2)" : "rgba(255, 255, 255, .12)";
        context.fill();
      }
      context.beginPath(); context.arc(x, y, active ? 5 : group.planets.length > 1 ? 4 : 3, 0, Math.PI * 2);
      context.fillStyle = active ? "#ffd495" : "#90d4cd";
      context.fill();
      if (active) {
        context.fillStyle = "#fff5de";
        context.font = "600 12px system-ui";
        context.fillText(group.name, Math.min(x + 11, width - 130), Math.max(y - 9, 20));
      }
    }
    if (!groups.length) {
      context.fillStyle = "#d4e6e5";
      context.textAlign = "center";
      context.font = "14px system-ui";
      context.fillText("Координаты появятся после обновления каталога NASA", width / 2, height / 2);
      context.textAlign = "start";
    }
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function nearest(event) {
    const mouse = point(event);
    let result = null;
    let distance = 14;
    for (let index = 0; index < groups.length; index++) {
      const marker = project(groups[index].ra, groups[index].dec, canvas.clientWidth, canvas.clientHeight);
      const delta = Math.hypot(mouse.x - marker.x, mouse.y - marker.y);
      if (delta < distance) { result = index; distance = delta; }
    }
    return result;
  }

  canvas.addEventListener("pointermove", event => {
    const index = nearest(event);
    canvas.style.cursor = index == null ? "default" : "pointer";
    canvas.title = index == null ? "" : `${groups[index].name} · ${groups[index].planets.length} планет в рейтинге`;
  });
  canvas.addEventListener("click", event => {
    const index = nearest(event);
    if (index == null) return;
    focused = index;
    const group = groups[index];
    const selectedIndex = group.planets.findIndex(planet => planet.name === selected);
    onSelect(group.planets[(selectedIndex + 1) % group.planets.length].name);
  });
  canvas.addEventListener("keydown", event => {
    if (!groups.length) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      focused = (focused + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + groups.length) % groups.length;
      canvas.title = groups[focused].name;
      draw();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(groups[focused].planets[0].name);
    }
  });
  canvas.addEventListener("blur", draw);
  new ResizeObserver(draw).observe(canvas);

  window.ExoSkyMap = {
    setPlanets(items) { planets = items; rebuild(); draw(); },
    select(name) { selected = name; const index = groups.findIndex(group => group.planets.some(planet => planet.name === name)); if (index >= 0) focused = index; draw(); },
    onSelect(callback) { onSelect = callback; }
  };
})();
