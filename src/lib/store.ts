import { DEFAULT_TEMPLATES, type Template } from "./photo"

export type Tab = "metadata" | "location" | "time" | "overlay"
export type ReportFormat = "csv" | "json" | "both"

export interface Prefs {
  tab: Tab
  templateId: string
  exportOverlay: boolean
  exportMeta: boolean
  reportFormat: ReportFormat
}

export interface Activity {
  id: string
  at: Date
  kind: "import" | "edit" | "revert" | "export"
  text: string
}

// Clean up obsolete localStorage keys once on initialization
if (typeof localStorage !== "undefined") {
  try {
    localStorage.removeItem("gs_user")
    localStorage.removeItem("gs_ws")
    localStorage.removeItem("gs_audit")
  } catch {
    // Ignore storage errors
  }
}

const ls = <T>(k: string, d: T): T => {
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return d
    return JSON.parse(raw) as T
  } catch {
    return d
  }
}

const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    // Ignore storage errors
  }
}

export const loadTemplates = (): Template[] => {
  const t = ls<Template[]>("gs_templates", DEFAULT_TEMPLATES)
  return Array.isArray(t) && t.length > 0 ? t : DEFAULT_TEMPLATES
}
export const saveTemplates = (t: Template[]) => save("gs_templates", t)

export const DEFAULT_PREFS: Prefs = {
  tab: "metadata",
  templateId: DEFAULT_TEMPLATES[0]?.id ?? "classic",
  exportOverlay: true,
  exportMeta: true,
  reportFormat: "both",
}

export const loadPrefs = (): Prefs => {
  const stored = ls<Partial<Prefs>>("gs_prefs", {})
  return { ...DEFAULT_PREFS, ...stored }
}

export const savePrefs = (p: Partial<Prefs>) => {
  const current = loadPrefs()
  save("gs_prefs", { ...current, ...p })
}
