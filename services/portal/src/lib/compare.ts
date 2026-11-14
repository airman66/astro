import { useEffect, useState } from "preact/hooks";

// Выбор планет для сравнения хранится только в браузере (это удобство одного зрителя).
const KEY = "parallax.compare";
const EVENT = "portal:compare";
export const COMPARE_LIMIT = 4;

function read(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, COMPARE_LIMIT) : [];
  } catch {
    return [];
  }
}

function write(names: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    /* хранилище недоступно: выбор живёт до перезагрузки */
  }
  memory = names;
  window.dispatchEvent(new Event(EVENT));
}

let memory: string[] | null = null;

export function getCompare(): string[] {
  if (memory === null) memory = read();
  return memory;
}

export function toggleCompare(name: string): void {
  const names = getCompare();
  if (names.includes(name)) write(names.filter((item) => item !== name));
  else if (names.length < COMPARE_LIMIT) write([...names, name]);
}

export function clearCompare(): void {
  write([]);
}

export function useCompare(): string[] {
  const [names, setNames] = useState(getCompare);
  useEffect(() => {
    const update = () => setNames([...getCompare()]);
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", () => {
      memory = read();
      update();
    });
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return names;
}
