export interface AssistantContext {
  planet?: string;
  term?: number;
}

export const ASSISTANT_OPEN = "portal:assistant-open";

export function openAssistant(context: AssistantContext = {}) {
  window.dispatchEvent(new CustomEvent<AssistantContext>(ASSISTANT_OPEN, { detail: context }));
}
