import type { AnchorHTMLAttributes, ComponentChildren, TargetedMouseEvent } from "preact";
import { useEffect, useState } from "preact/hooks";

const EVENT = "portal:navigate";

export interface Location {
  path: string;
  query: URLSearchParams;
}

function current(): Location {
  return { path: decodeURI(window.location.pathname.replace(/\/+$/, "") || "/"), query: new URLSearchParams(window.location.search) };
}

export function navigate(to: string, options: { replace?: boolean; keepScroll?: boolean } = {}): void {
  if (to === window.location.pathname + window.location.search) return;
  if (options.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { keepScroll: options.keepScroll } }));
}

export function useLocation(): Location {
  const [location, setLocation] = useState(current);
  useEffect(() => {
    const update = (event: Event) => {
      const next = current();
      setLocation(next);
      const keepScroll = (event as CustomEvent).detail?.keepScroll;
      if (event.type === EVENT && !keepScroll) {
        window.scrollTo({ top: 0 });
        // Экранный диктор узнаёт о смене страницы: фокус переходит на основной заголовок.
        requestAnimationFrame(() => {
          const heading = document.querySelector<HTMLElement>("main h1");
          if (heading) {
            heading.setAttribute("tabindex", "-1");
            heading.focus({ preventScroll: true });
          }
        });
      }
    };
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return location;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  href: string;
  children?: ComponentChildren;
  keepScroll?: boolean;
  onClick?: (event: TargetedMouseEvent<HTMLAnchorElement>) => void;
};

export function Link({ href, keepScroll, onClick, ...rest }: LinkProps) {
  const handle = (event: TargetedMouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!href.startsWith("/") || href.startsWith("/api/")) return;
    event.preventDefault();
    navigate(href, { keepScroll });
  };
  return <a href={href} onClick={handle} {...(rest as Record<string, unknown>)} />;
}

/** Сопоставляет путь с шаблоном вида /planets/:name; возвращает параметры или null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function setQuery(values: Record<string, string | null>, replace = true): void {
  const query = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === "") query.delete(key);
    else query.set(key, value);
  }
  const text = query.toString();
  navigate(window.location.pathname + (text ? `?${text}` : ""), { replace, keepScroll: true });
}
