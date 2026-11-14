import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";

const canvas = document.getElementById("world-canvas");
const panel = document.getElementById("panel-world");
const $ = id => document.getElementById(id);
const format = (value, digits = 1) => value == null ? "нет данных" :
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
const kinds = {
  archipelago: { name: "Островной мир", description: "Вода, острова и горные хребты. Океан здесь придуман: его наличие на этой планете не установлено." },
  dunes: { name: "Мир дюн", description: "Песчаные гряды и каменные плато. Пустынный климат — художественный выбор, а не вывод из звёздного потока." },
  glacier: { name: "Ледяной мир", description: "Ледники, трещины и тёмные участки. Лёд не обнаружен; без данных об атмосфере нельзя восстановить температуру поверхности." },
  basalt: { name: "Базальтовый мир", description: "Тёмные скалы и светящиеся разломы. Рельеф и вулканизм полностью вымышлены." },
  clouds: { name: "Облачный мир", description: "Объёмные вихревые слои скрывают поверхность. Наличие облаков и состав атмосферы по текущим данным неизвестны." }
};
const cities = { domes: "купола", spires: "башни", platforms: "платформы" };
const creatures = { walkers: "шагающие", gliders: "парящие", colony: "колония" };
const state = { planet: null, kind: "archipelago", city: "domes", creature: "walkers", variation: 0,
  revealed: false, focused: false, spin: !matchMedia("(prefers-reduced-motion: reduce)").matches };
const Y = new THREE.Vector3(0, 1, 0);
const siteNormal = new THREE.Vector3(0, .16, 1).normalize();
const scene = new THREE.Scene();
scene.background = new THREE.Color("#081622");
const camera = new THREE.PerspectiveCamera(48, 1, .01, 50);
camera.position.set(0, .3, 3.5);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
  $("world-error").hidden = false;
  $("world-error").textContent = "WebGL недоступен в этом браузере. Для 3D-сцены нужен браузер с поддержкой WebGL 2.";
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.enablePan = false;
  controls.minDistance = 1.18;
  controls.maxDistance = 8;
  controls.rotateSpeed = .7;
  controls.target.set(0, 0, 0);
  controls.update();
  controls.addEventListener("start", () => {
    if (state.spin && !state.focused) { state.spin = false; renderLabels(); }
  });

  scene.add(new THREE.AmbientLight("#c8dce5", 1.6));
  const sun = new THREE.DirectionalLight("#ffe0b2", 3.8);
  sun.position.set(-3, 2, 4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#6ca4bb", .9);
  fill.position.set(2, -1, -3);
  scene.add(fill);

  const stars = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const a = i * 2.39996, z = 1 - 2 * (i + .5) / 500;
    const radius = 6 + (i * 37 % 23) / 6;
    const across = Math.sqrt(1 - z * z);
    stars[i * 3] = Math.cos(a) * across * radius;
    stars[i * 3 + 1] = z * radius;
    stars[i * 3 + 2] = Math.sin(a) * across * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#aac7d2", size: .027, sizeAttenuation: true })));

  let world = new THREE.Group();
  let site;
  let moving;
  const animated = [];
  scene.add(world);

  function hashText(value) {
    let hash = 2166136261;
    for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  }
  const seed = () => hashText(`${state.planet?.name}|${state.kind}|${state.variation}`);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  function random3(x, y, z, s) {
    let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ s;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  }
  function noise3(x, y, z, s) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    const corner = (dx, dy, dz) => random3(ix + dx, iy + dy, iz + dz, s);
    const low = mix(mix(corner(0, 0, 0), corner(1, 0, 0), fx), mix(corner(0, 1, 0), corner(1, 1, 0), fx), fy);
    const high = mix(mix(corner(0, 0, 1), corner(1, 0, 1), fx), mix(corner(0, 1, 1), corner(1, 1, 1), fx), fy);
    return mix(low, high, fz);
  }
  function terrain(direction, s) {
    const offset = (s % 997) / 91;
    const sample = frequency => noise3(direction.x * frequency + offset, direction.y * frequency + 3.1, direction.z * frequency + 7.3, s);
    return .53 * sample(3.5) + .3 * sample(8.2) + .17 * sample(19);
  }
  function height(kind, value, direction) {
    let radius = kind === "archipelago" ? 1 + Math.max(0, value - .5) * .42 :
      kind === "clouds" ? 1.025 + (value - .5) * .045 :
      kind === "glacier" ? 1.035 + (value - .5) * .23 :
      kind === "dunes" ? 1.035 + (value - .5) * .17 : 1.03 + (value - .5) * .27;
    if (state.revealed) radius = mix(radius, 1.045, smooth(clamp((direction.dot(siteNormal) - .965) / .025, 0, 1)));
    return radius;
  }
  function surface(kind, value, detail) {
    if (kind === "archipelago") return value < .5 ? [20, 86 + value * 52, 123 + detail * 47] :
      value < .53 ? [198, 180, 132] : [62 + detail * 48, 123 + value * 45, 102 + detail * 48];
    if (kind === "dunes") return [166 + value * 73, 91 + value * 85, 69 + detail * 75];
    if (kind === "glacier") return value < .36 ? [36, 92, 119] : [147 + value * 87, 196 + value * 46, 205 + detail * 34];
    if (kind === "basalt") return value > .59 && detail > .62 ? [235, 89 + detail * 68, 51] :
      [49 + value * 61, 47 + detail * 41, 59 + value * 52];
    return [135 + value * 101, 158 + value * 81, 173 + detail * 68];
  }
  function material(color, emissive = null) {
    return new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: .1,
      emissive: emissive ?? "#000000", emissiveIntensity: emissive ? .45 : 0 });
  }
  function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(x, y, z);
    parent.add(item);
    return item;
  }
  function link(parent, a, b, radius, mat) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const line = mesh(parent, new THREE.CylinderGeometry(radius, radius * 1.2, start.distanceTo(end), 8), mat);
    line.position.copy(start).add(end).multiplyScalar(.5);
    line.quaternion.setFromUnitVectors(Y, end.sub(start).normalize());
  }
  function addTerrain() {
    const geometry = new THREE.SphereGeometry(1, 128, 96);
    const points = geometry.getAttribute("position");
    const colors = new Float32Array(points.count * 3);
    const direction = new THREE.Vector3();
    const color = new THREE.Color();
    const currentSeed = seed();
    for (let i = 0; i < points.count; i++) {
      direction.set(points.getX(i), points.getY(i), points.getZ(i)).normalize();
      const value = terrain(direction, currentSeed);
      const detail = noise3(direction.x * 31 + 8, direction.y * 31 + 4, direction.z * 31 + 2, currentSeed + 41);
      const radius = height(state.kind, value, direction);
      points.setXYZ(i, direction.x * radius, direction.y * radius, direction.z * radius);
      const rgb = surface(state.kind, value, detail);
      color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    mesh(world, geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .02 }));
  }
  function addBuilding(parent, type, x, z, index, s) {
    const dark = material("#244354");
    const metal = material("#6b9ba3");
    const glow = material("#d6e6d8", "#a8e3d7");
    const size = .8 + random3(index, 2, 1, s) * .45;
    const building = new THREE.Group();
    building.position.set(x, .012, z);
    building.scale.setScalar(size);
    parent.add(building);
    if (type === "domes") {
      mesh(building, new THREE.CylinderGeometry(.052, .057, .018, 20), dark, 0, .009);
      mesh(building, new THREE.SphereGeometry(.052, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, .018);
      mesh(building, new THREE.TorusGeometry(.05, .003, 6, 24), glow, 0, .019).rotation.x = Math.PI / 2;
    } else if (type === "spires") {
      mesh(building, new THREE.CylinderGeometry(.024, .037, .13, 8), dark, 0, .065);
      mesh(building, new THREE.ConeGeometry(.029, .067, 8), metal, 0, .16);
      for (let y = .05; y < .13; y += .027)
        mesh(building, new THREE.TorusGeometry(.026, .002, 5, 12), glow, 0, y).rotation.x = Math.PI / 2;
    } else {
      mesh(building, new THREE.CylinderGeometry(.057, .067, .012, 24), metal, 0, .09);
      mesh(building, new THREE.CylinderGeometry(.028, .042, .04, 16), dark, 0, .117);
      mesh(building, new THREE.TorusGeometry(.058, .003, 6, 24), glow, 0, .09).rotation.x = Math.PI / 2;
    }
  }
  function addCreature(parent, type, x, z, index, s) {
    const body = material(index % 2 ? "#9ac7bd" : "#d0c4a5");
    const accent = material("#f4d79e", "#d6b77e");
    const root = new THREE.Group();
    root.position.set(x, .015, z);
    root.scale.setScalar(.78 + random3(index, 4, 2, s) * .45);
    parent.add(root);
    if (type === "walkers") {
      const torso = mesh(root, new THREE.SphereGeometry(.018, 12, 8), body, 0, .06);
      torso.scale.set(.9, 1.5, .8);
      mesh(root, new THREE.SphereGeometry(.012, 10, 8), body, 0, .095);
      for (const dx of [-.014, .014]) {
        link(root, [dx * .55, .047, 0], [dx * 1.4, 0, .007], .0035, body);
        link(root, [dx * .6, .08, 0], [dx * 1.8, .055, .008], .0025, body);
      }
      mesh(root, new THREE.SphereGeometry(.004, 8, 6), accent, -.005, .099, .01);
      mesh(root, new THREE.SphereGeometry(.004, 8, 6), accent, .005, .099, .01);
    } else if (type === "gliders") {
      mesh(root, new THREE.SphereGeometry(.014, 10, 8), body, 0, .12);
      const wingShape = new THREE.BufferGeometry();
      wingShape.setAttribute("position", new THREE.Float32BufferAttribute([
        0, .12, 0, -.075, .14, -.004, -.025, .105, .012,
        0, .12, 0, .075, .14, -.004, .025, .105, .012
      ], 3));
      wingShape.computeVertexNormals();
      mesh(root, wingShape, new THREE.MeshStandardMaterial({ color: "#a8d1c6", side: THREE.DoubleSide, roughness: .8 }));
      link(root, [0, .11, 0], [0, .085, .015], .002, body);
    } else {
      for (let part = 0; part < 6; part++) {
        const angle = part * 2.4, radius = .008 + part * .004;
        const px = Math.cos(angle) * radius, pz = Math.sin(angle) * radius;
        const py = .015 + part * .011;
        mesh(root, new THREE.SphereGeometry(.012 - part * .0007, 10, 8), body, px, py, pz);
        if (part) link(root, [px, py, pz], [0, .018, 0], .0025, body);
      }
      mesh(root, new THREE.SphereGeometry(.005, 8, 6), accent, 0, .079, .01);
    }
    animated.push({ root, y: root.position.y, phase: index * 1.7, flying: type === "gliders" });
  }
  function addSettlement() {
    site = new THREE.Group();
    site.position.copy(siteNormal).multiplyScalar(1.048);
    site.quaternion.setFromUnitVectors(Y, siteNormal);
    world.add(site);
    const base = material("#354d58");
    mesh(site, new THREE.CylinderGeometry(.245, .255, .012, 48), base, 0, -.002);
    const s = seed();
    [[-.14, -.045], [0, -.09], [.14, -.045], [-.07, .06], [.09, .07]].forEach(([x, z], i) =>
      addBuilding(site, state.city, x, z, i, s));
    [[-.14, .13], [-.035, .14], [.075, .15], [.16, .12]].forEach(([x, z], i) =>
      addCreature(site, state.creature, x, z, i, s));
  }
  function dispose(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(item => {
      if (item.geometry) geometries.add(item.geometry);
      if (item.material) for (const mat of [].concat(item.material)) materials.add(mat);
    });
    geometries.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
  }
  function rebuild() {
    scene.remove(world);
    dispose(world);
    world = new THREE.Group();
    scene.add(world);
    site = null;
    animated.length = 0;
    if (!state.planet) return;
    addTerrain();
    if (state.revealed) addSettlement();
    if (state.focused && site) moveCamera(true);
  }
  function moveCamera(close) {
    state.focused = close;
    controls.minDistance = .2;
    if (close && site) {
      world.updateMatrixWorld(true);
      const target = site.localToWorld(new THREE.Vector3(0, .055, .055));
      const destination = site.localToWorld(new THREE.Vector3(.13, .24, .39));
      moving = { target, position: destination };
    } else {
      moving = { target: new THREE.Vector3(), position: new THREE.Vector3(0, .3, 3.5) };
    }
    controls.enabled = false;
    renderLabels();
  }
  function renderLabels() {
    if (!state.planet) return;
    $("world-planet-name").textContent = state.planet.name;
    $("world-facts").textContent = `NASA · радиус ${format(state.planet.radiusEarth, 2)} R⊕ · поток ${format(state.planet.fluxEarth, 2)} S⊕ · звезда ${format(state.planet.stellarTemperatureK, 0)} K`;
    $("world-type-name").textContent = kinds[state.kind].name;
    $("world-seed").textContent = `Вариант ${String(state.variation + 1).padStart(2, "0")} · потяните для поворота · колесо/жест для масштаба`;
    $("world-description").textContent = kinds[state.kind].description;
    $("world-spin").textContent = state.focused ? "На паузе" : state.spin ? "Пауза" : "Вращать";
    $("world-spin").disabled = state.focused;
    $("world-spin").setAttribute("aria-pressed", String(state.spin));
    $("world-focus").disabled = !state.revealed;
    $("world-focus").textContent = state.focused ? "Вся планета" : "К существам";
    $("world-reveal").textContent = state.revealed ? "Скрыть" : "Показать";
    $("world-reveal").setAttribute("aria-pressed", String(state.revealed));
    $("civilization-state").textContent = state.revealed
      ? `Художественная гипотеза: ${cities[state.city]} и ${creatures[state.creature]} существа на поверхности. Жизнь здесь не обнаружена.`
      : "Нажмите «Показать», затем «К существам», чтобы приблизиться.";
    canvas.setAttribute("aria-label", `3D-мир ${state.planet.name}: ${kinds[state.kind].name}. ${state.revealed ? `Вымышленные ${cities[state.city]} и ${creatures[state.creature]} существа.` : "Без цивилизации."} Перетаскивание поворачивает камеру, колесо или жест меняет масштаб.`);
    for (const button of document.querySelectorAll("[data-world], [data-city], [data-creature]")) {
      const key = button.dataset.world ? "world" : button.dataset.city ? "city" : "creature";
      button.setAttribute("aria-pressed", String(button.dataset[key] === (key === "world" ? state.kind : state[key])));
    }
  }
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  let lastTime = 0;
  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min(.05, (time - lastTime) / 1000 || 0);
    lastTime = time;
    if (panel.hidden || document.hidden || !state.planet) return;
    if (state.spin && !state.focused && !moving) world.rotation.y += delta * .2;
    if (moving) {
      camera.position.lerp(moving.position, .12);
      controls.target.lerp(moving.target, .12);
      if (camera.position.distanceTo(moving.position) < .012 && controls.target.distanceTo(moving.target) < .012) {
        camera.position.copy(moving.position);
        controls.target.copy(moving.target);
        moving = null;
        controls.minDistance = state.focused ? .2 : 1.18;
        controls.enabled = true;
      }
    }
    animated.forEach(item => { item.root.position.y = item.y + Math.sin(time / 600 + item.phase) * (item.flying ? .009 : .002); });
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  document.querySelectorAll("[data-world], [data-city], [data-creature]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.world ? "kind" : button.dataset.city ? "city" : "creature";
    state[key] = button.dataset.world ?? button.dataset.city ?? button.dataset.creature;
    if (key !== "kind") state.revealed = true;
    rebuild();
    renderLabels();
  }));
  $("world-regenerate").addEventListener("click", () => { state.variation++; rebuild(); renderLabels(); });
  $("world-reveal").addEventListener("click", () => {
    state.revealed = !state.revealed;
    if (!state.revealed && state.focused) moveCamera(false);
    rebuild(); renderLabels();
  });
  $("world-focus").addEventListener("click", () => { if (state.revealed) moveCamera(!state.focused); });
  $("world-spin").addEventListener("click", () => { state.spin = !state.spin; renderLabels(); });
  canvas.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "+", "=", "-", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === " ") state.spin = !state.spin;
    else if (event.key.startsWith("Arrow")) { state.spin = false; world.rotation.y += event.key === "ArrowLeft" ? -.17 : .17; }
    else {
      const direction = camera.position.clone().sub(controls.target);
      const distance = clamp(direction.length() * (event.key === "-" ? 1.15 : .85), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(direction.setLength(distance));
    }
    renderLabels();
  });
  window.ExoWorldLab = { setPlanet(planet) {
    const changed = planet.name !== state.planet?.name;
    state.planet = planet;
    if (changed) {
      state.variation = 0;
      state.revealed = false;
      state.focused = false;
      world.rotation.y = 0;
      camera.position.set(0, .3, 3.5);
      controls.target.set(0, 0, 0);
      controls.minDistance = 1.18;
      controls.enabled = true;
      moving = null;
      rebuild();
    }
    resize();
    renderLabels();
  } };
  window.dispatchEvent(new Event("exo-world-ready"));
}
