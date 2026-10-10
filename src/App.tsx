import { useEffect, useMemo, useState } from "react"
import JSZip from "jszip"
import {
  Aperture,
  Camera,
  Clock,
  Download,
  FileArchive,
  History,
  ImagePlus,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import MapEditor from "./components/MapEditor"
import {
  canvasBlob,
  effective,
  formatStamp,
  isEdited,
  metadataCopy,
  readPhoto,
  renderOverlay,
  shiftTime,
  type Photo,
  type Template,
} from "./lib/photo"
import {
  loadPrefs,
  loadTemplates,
  savePrefs,
  saveTemplates,
  type Activity,
  type ReportFormat,
  type Tab,
} from "./lib/store"

const OFFSETS = [
  "+05:30",
  "+00:00",
  "+01:00",
  "+04:00",
  "+05:45",
  "+08:00",
  "+09:00",
  "-05:00",
  "-08:00",
]

export default function App() {
  return <Studio />
}

function Studio() {
  const initialPrefs = useMemo(() => loadPrefs(), [])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>(initialPrefs.tab)
  const [templates, setTemplates] = useState<Template[]>(loadTemplates)
  const [tplId, setTplId] = useState<string>(() => {
    const exists = templates.some((t) => t.id === initialPrefs.templateId)
    return exists ? initialPrefs.templateId : (templates[0]?.id ?? "")
  })
  const [activities, setActivities] = useState<Activity[]>([])
  const [drag, setDrag] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

  // Sync templates and preferences to localStorage
  useEffect(() => {
    saveTemplates(templates)
  }, [templates])

  useEffect(() => {
    if (!templates.some((t) => t.id === tplId) && templates[0]) {
      setTplId(templates[0].id)
    }
  }, [templates, tplId])

  useEffect(() => {
    savePrefs({ tab, templateId: tplId })
  }, [tab, tplId])

  // Protect unsaved in-memory edits on accidental page reload
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedWork = photos.length > 0 && photos.some(isEdited)
      if (hasUnsavedWork) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [photos])

  const active = photos.find((p) => p.id === activeId) ?? null
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0]
  const targets = selected.size
    ? photos.filter((p) => selected.has(p.id))
    : active
      ? [active]
      : []

  const addActivity = (kind: Activity["kind"], text: string) => {
    const entry: Activity = {
      id: crypto.randomUUID(),
      at: new Date(),
      kind,
      text,
    }
    setActivities((prev) => [entry, ...prev].slice(0, 500))
  }

  async function addFiles(files: FileList | File[]) {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"))
    if (!imgs.length) return
    const read = await Promise.all(imgs.map(readPhoto))
    setPhotos((p) => [...p, ...read])
    if (!activeId && read[0]) setActiveId(read[0].id)
    addActivity(
      "import",
      `Imported ${read.length} photo${
        read.length > 1 ? "s" : ""
      }: ${read.map((r) => r.file.name).join(", ")}`,
    )
  }

  function editTargets(
    fn: (p: Photo) => Photo["edits"],
    _action: string,
    details: string,
  ) {
    const ids = new Set(targets.map((t) => t.id))
    setPhotos((ps) =>
      ps.map((p) =>
        ids.has(p.id) ? { ...p, edits: { ...p.edits, ...fn(p) } } : p,
      ),
    )
    addActivity(
      "edit",
      `${details} → ${targets.map((t) => t.file.name).join(", ")}`,
    )
  }

  function revert(p: Photo) {
    setPhotos((ps) => ps.map((x) => (x.id === p.id ? { ...x, edits: {} } : x)))
    addActivity("revert", `Reverted edits for ${p.file.name}`)
  }

  function handleNewSession() {
    if (!photos.length) return
    const ok = window.confirm(
      "Start a new session? All in-memory photos and session activity will be cleared.",
    )
    if (!ok) return
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
    setSelected(new Set())
    setActiveId(null)
    setActivities([])
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 px-5">
        <div className="flex items-center gap-2 text-accent">
          <Aperture size={20} />
          <span className="font-semibold text-white">GeoSnap</span>
        </div>
        <span className="h-5 w-px bg-white/10" />
        <span className="text-sm text-neutral-400">
          Session · {photos.length} photo{photos.length === 1 ? "" : "s"}
        </span>
        <button
          className="btn-ghost flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white"
          disabled={!photos.length}
          onClick={handleNewSession}
          title="Clear session photos and activity from memory"
        >
          <RotateCcw size={14} />
          New session
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-ghost flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
            onClick={() => setShowPrivacy(true)}
            title="Privacy notice"
          >
            <ShieldCheck size={14} />
            Privacy
          </button>
          <button
            className="btn-ghost flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white"
            onClick={() => setShowActivity(true)}
            title="Session activity log"
          >
            <History size={14} />
            Activity
            {activities.length > 0 && (
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {activities.length}
              </span>
            )}
          </button>
          <button
            className="btn-primary"
            disabled={!photos.length || exporting}
            onClick={async () => {
              setExporting(true)
              try {
                if (targets.length === 1) {
                  const p = targets[0]
                  const canvas = await renderOverlay(p, tpl)
                  const base64 = canvas.toDataURL("image/jpeg", 0.95)
                  const finalBlob = await metadataCopy(p, base64)
                  const blob = finalBlob || await canvasBlob(canvas)
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `${p.file.name.replace(/\.[^.]+$/, "")}_geosnap.jpg`
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                  addActivity("export", `Downloaded 1 image`)
                } else {
                  const zip = new JSZip()
                  for (let i = 0; i < targets.length; i++) {
                    const p = targets[i]
                    const canvas = await renderOverlay(p, tpl)
                    const base64 = canvas.toDataURL("image/jpeg", 0.95)
                    const finalBlob = await metadataCopy(p, base64)
                    const blob = finalBlob || await canvasBlob(canvas)
                    zip.file(`${p.file.name.replace(/\.[^.]+$/, "")}_geosnap.jpg`, blob)
                  }
                  const blob = await zip.generateAsync({ type: "blob" })
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `GeoSnap_Export_${new Date().toISOString().slice(0, 10)}.zip`
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                  addActivity("export", `Downloaded ${targets.length} images`)
                }
              } finally {
                setExporting(false)
              }
            }}
          >
            <Download size={15} />
            {exporting 
              ? "Downloading..." 
              : targets.length === 1 && selected.size > 0
                ? "Download 1 Selected Image"
                : selected.size > 1
                  ? `Download ${targets.length} Selected Images`
                  : photos.length === 1 
                    ? "Download Image"
                    : `Download All ${photos.length} Images`}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          className={`relative flex min-w-0 flex-1 flex-col ${
            drag ? "bg-accent/5" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            addFiles(e.dataTransfer.files)
          }}
        >
          {!photos.length ? (
            <div className="m-6 flex flex-1 flex-col items-center justify-center">
              <label className="flex w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-12 text-center hover:border-accent/50 transition-colors">
                <ImagePlus size={40} className="text-accent" />
                <p className="mt-4 text-lg font-medium">
                  Drop event photos here
                </p>
                <p className="mt-1 max-w-md text-sm text-neutral-400">
                  JPEG, PNG, HEIC previews. Files are read in your browser —
                  originals are never modified or uploaded.
                </p>
                <span className="mt-4 rounded-md bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/15">
                  Select photos
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </label>
              <p className="mt-4 max-w-lg text-center text-xs text-neutral-500">
                GeoSnap processes photos entirely in your browser — nothing is
                uploaded or stored on a server. Map tiles are loaded from
                OpenStreetMap.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 py-3 text-sm text-neutral-400">
                <span>{photos.length} photos</span>
                <span>·</span>
                <span>
                  {selected.size
                    ? `${selected.size} selected for batch`
                    : "Click checkbox to batch-select"}
                </span>
                <button
                  className="text-xs hover:text-white"
                  onClick={() =>
                    setSelected(
                      selected.size === photos.length
                        ? new Set()
                        : new Set(photos.map((p) => p.id)),
                    )
                  }
                >
                  {selected.size === photos.length ? "Clear" : "Select all"}
                </button>
                <label className="btn-ghost ml-auto cursor-pointer">
                  <Plus size={14} />
                  Add
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    hidden
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                </label>
              </div>
              <div className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 overflow-y-auto px-5 pb-5">
                {photos.map((p) => {
                  const e = effective(p)
                  const hasGpsEdit =
                    p.edits.lat != null ||
                    p.edits.lng != null ||
                    !!p.edits.address
                  const hasTimeEdit = !!p.edits.dateTime || !!p.edits.offset
                  return (
                    <div
                      key={p.id}
                      onClick={() => setActiveId(p.id)}
                      className={`group relative cursor-pointer overflow-hidden rounded-lg border ${
                        p.id === activeId
                          ? "border-accent"
                          : "border-white/5 hover:border-white/20"
                      }`}
                    >
                      <img
                        src={p.url}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={() => toggle(p.id)}
                        className="absolute left-2 top-2 h-4 w-4 accent-[#f5b544]"
                      />
                      {(hasGpsEdit || hasTimeEdit) && (
                        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                          {hasGpsEdit && (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-black shadow-sm">
                              GPS edited
                            </span>
                          )}
                          {hasTimeEdit && (
                            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black shadow-sm">
                              Time edited
                            </span>
                          )}
                        </div>
                      )}
                      <div className="bg-black/40 px-2.5 py-2 text-xs">
                        <div className="truncate font-medium">
                          {p.file.name}
                        </div>
                        <div className="mt-0.5 flex gap-2 text-neutral-500">
                          <span className="flex items-center gap-1">
                            <MapPin size={11} />
                            {e.lat != null ? "GPS" : "—"}
                          </span>
                          <span className="truncate">
                            {e.dateTime?.replace("T", " ") ?? "no time"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/5">
          <div className="flex border-b border-white/5 text-sm">
            {([
              ["metadata", Camera],
              ["location", MapPin],
              ["time", Clock],
              ["overlay", Sliders],
            ] as const).map(([k, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-3 capitalize ${
                  tab === k
                    ? "border-b-2 border-accent text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <Icon size={14} />
                {k}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {!active ? (
              <p className="text-sm text-neutral-500">
                Select a photo to inspect.
              </p>
            ) : (
              <>
                {targets.length > 1 && tab !== "metadata" && (
                  <p className="mb-4 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">
                    Batch mode: changes apply to {targets.length} selected
                    photos.
                  </p>
                )}
                {tab === "metadata" && (
                  <MetadataPanel p={active} onRevert={() => revert(active)} />
                )}
                {tab === "location" && (
                  <LocationPanel p={active} apply={editTargets} />
                )}
                {tab === "time" && <TimePanel p={active} apply={editTargets} />}
                {tab === "overlay" && (
                  <OverlayPanel
                    p={active}
                    templates={templates}
                    setTemplates={setTemplates}
                    tplId={tpl.id}
                    setTplId={setTplId}
                    apply={editTargets}
                  />
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      
      {showActivity && (
        <ActivityDialog
          activities={activities}
          onClear={() => setActivities([])}
          onClose={() => setShowActivity(false)}
        />
      )}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  )
}

function Row({
  k,
  orig,
  edit,
  manualLabel = "edited",
}: {
  k: string
  orig: React.ReactNode
  edit?: React.ReactNode
  manualLabel?: string
}) {
  const hasOrig = orig != null && orig !== ""
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 border-b border-white/5 py-2 text-sm">
      <span className="text-neutral-500">{k}</span>
      <div>
        <div
          className={`font-mono text-xs ${
            edit != null
              ? "text-neutral-500 line-through"
              : hasOrig
                ? "text-neutral-200"
                : "text-neutral-500 italic"
          }`}
        >
          {hasOrig ? orig : "Not recorded by camera"}
        </div>
        {edit != null && (
          <div className="font-mono text-xs text-accent">
            {edit}{" "}
            <span className="font-sans text-[10px] uppercase">
              {manualLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function MetadataPanel({ p, onRevert }: { p: Photo; onRevert: () => void }) {
  const o = p.original
  const ed = p.edits
  const [raw, setRaw] = useState(false)
  return (
    <div>
      <img
        src={p.url}
        className="mb-4 max-h-56 w-full rounded-lg object-contain bg-black"
      />
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-medium">{p.file.name}</h3>
          <p className="text-xs text-neutral-500">
            {(p.file.size / 1048576).toFixed(2)} MB · {o.width} × {o.height}
          </p>
        </div>
        {isEdited(p) && (
          <button className="btn-ghost text-xs" onClick={onRevert}>
            <Undo2 size={13} />
            Revert
          </button>
        )}
      </div>
      <div className="mb-3 rounded-md border border-white/5 bg-white/[0.02] p-2 text-[11px] leading-relaxed text-neutral-400">
        <span className="font-medium text-neutral-200">
          Camera-recorded (EXIF)
        </span>{" "}
        vs{" "}
        <span className="font-medium text-accent">
          Manually set in GeoSnap — not camera-verified
        </span>
      </div>
      <Row
        k="Captured"
        orig={o.dateTime?.replace("T", " ")}
        edit={ed.dateTime?.replace("T", " ")}
      />
      <Row k="Timezone" orig={o.offset} edit={ed.offset} />
      <Row k="Latitude" orig={o.lat?.toFixed(6)} edit={ed.lat?.toFixed(6)} />
      <Row k="Longitude" orig={o.lng?.toFixed(6)} edit={ed.lng?.toFixed(6)} />
      <Row
        k="Address"
        orig={null}
        edit={ed.address || undefined}
        manualLabel="manual entry"
      />
      <Row
        k="Camera"
        orig={[o.make, o.model].filter(Boolean).join(" ") || undefined}
      />
      <Row k="Lens" orig={o.lens} />
      <Row
        k="Exposure"
        orig={
          o.exposure
            ? `${
                o.exposure < 1 ? `1/${Math.round(1 / o.exposure)}` : o.exposure
              }s · f/${o.fNumber ?? "?"} · ISO ${o.iso ?? "?"}`
            : undefined
        }
      />
      <Row k="Focal" orig={o.focal ? `${o.focal} mm` : undefined} />
      <button
        className="mt-4 text-xs text-neutral-500 hover:text-white"
        onClick={() => setRaw(!raw)}
      >
        {raw ? "Hide" : "Show"} all raw EXIF tags ({Object.keys(o.raw).length})
      </button>
      {raw && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-black/40 p-3 font-mono text-[10px] text-neutral-400">
          {Object.entries(o.raw)
            .map(
              ([k, v]) =>
                `${k}: ${
                  typeof v === "object"
                    ? JSON.stringify(v)?.slice(0, 80)
                    : String(v)
                }`,
            )
            .join("\n")}
        </pre>
      )}
    </div>
  )
}

type Apply = (
  fn: (p: Photo) => Photo["edits"],
  action: string,
  details: string,
) => void

function LocationPanel({ p, apply }: { p: Photo; apply: Apply }) {
  const e = effective(p)
  const [lat, setLat] = useState(e.lat?.toFixed(6) ?? "")
  const [lng, setLng] = useState(e.lng?.toFixed(6) ?? "")
  const [addr, setAddr] = useState(e.address)
  useEffect(() => {
    setLat(e.lat?.toFixed(6) ?? "")
    setLng(e.lng?.toFixed(6) ?? "")
    setAddr(e.address)
  }, [p.id, e.lat, e.lng, e.address])

  const nl = parseFloat(lat)
  const ng = parseFloat(lng)
  const valid =
    !isNaN(nl) && !isNaN(ng) && Math.abs(nl) <= 90 && Math.abs(ng) <= 180

  return (
    <div className="space-y-4">
      <MapEditor
        lat={valid ? nl : null}
        lng={valid ? ng : null}
        onChange={(a, b) => {
          setLat(a.toFixed(6))
          setLng(b.toFixed(6))
        }}
      />
      <p className="text-xs text-neutral-500">
        Click the map or drag the pin. Only map tiles are fetched from
        OpenStreetMap — no photos leave the device.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Latitude</label>
          <input
            className="field font-mono"
            value={lat}
            onChange={(x) => setLat(x.target.value)}
          />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input
            className="field font-mono"
            value={lng}
            onChange={(x) => setLat(x.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label">Address line (for overlay)</label>
        <input
          className="field"
          placeholder="RGIT, Versova, Andheri West, Mumbai 400053"
          value={addr}
          onChange={(x) => setAddr(x.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          className="btn-ghost"
          onClick={() => {
            setLat("19.130700")
            setLng("72.819700")
            setAddr(
              "Rajiv Gandhi Institute of Technology, Versova, Andheri West, Mumbai 400053",
            )
          }}
        >
          Use RGIT campus
        </button>
        <button
          className="btn-primary flex-1"
          disabled={!valid}
          onClick={() =>
            apply(
              () => ({ lat: nl, lng: ng, address: addr || undefined }),
              "edit.location",
              `Location: ${nl.toFixed(6)}, ${ng.toFixed(6)}${
                addr ? ` (${addr})` : ""
              }`,
            )
          }
        >
          Apply location
        </button>
      </div>
    </div>
  )
}

function TimePanel({ p, apply }: { p: Photo; apply: Apply }) {
  const e = effective(p)
  const [dt, setDt] = useState(e.dateTime ?? "")
  const [off, setOff] = useState(e.offset)
  const [shift, setShift] = useState("0")
  useEffect(() => {
    setDt(e.dateTime ?? "")
    setOff(e.offset)
  }, [p.id, e.dateTime, e.offset])

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
        <div className="label">Original camera time</div>
        <div className="font-mono text-xs text-neutral-300">
          {p.original.dateTime?.replace("T", " ") ?? "Not recorded by camera"}{" "}
          {p.original.offset ?? "(timezone unspecified)"}
        </div>
      </div>
      <div>
        <label className="label">Set exact time</label>
        <input
          type="datetime-local"
          step={1}
          className="field [color-scheme:dark]"
          value={dt}
          onChange={(x) => setDt(x.target.value)}
        />
      </div>
      <div>
        <label className="label">Timezone (UTC offset)</label>
        <select
          className="field"
          value={off}
          onChange={(x) => setOff(x.target.value)}
        >
          {OFFSETS.map((o) => (
            <option key={o} value={o} className="bg-neutral-900">
              GMT {o}
              {o === "+05:30" ? " · IST" : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-neutral-500">
        Preview: {formatStamp(dt || null, off)}
      </p>
      <button
        className="btn-primary w-full"
        disabled={!dt}
        onClick={() =>
          apply(
            () => ({
              dateTime: dt.length === 16 ? dt + ":00" : dt,
              offset: off,
            }),
            "edit.time",
            `Time: ${dt} ${off}`,
          )
        }
      >
        Apply exact time
      </button>
      <div className="border-t border-white/5 pt-5">
        <label className="label">
          Shift relative (minutes) — keeps spacing between batch photos
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            className="field font-mono"
            value={shift}
            onChange={(x) => setShift(x.target.value)}
          />
          <button
            className="btn-ghost shrink-0"
            disabled={!Number(shift)}
            onClick={() =>
              apply(
                (q) => {
                  const base = effective(q).dateTime
                  return base
                    ? { dateTime: shiftTime(base, Number(shift)), offset: off }
                    : {}
                },
                "edit.time.shift",
                `Shift: ${shift} min (${off})`,
              )
            }
          >
            Shift
          </button>
        </div>
      </div>
    </div>
  )
}

function OverlayPanel({
  p,
  templates,
  setTemplates,
  tplId,
  setTplId,
}: {
  p: Photo
  templates: Template[]
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>
  tplId: string
  setTplId: (s: string) => void
  apply: Apply
}) {
  const t = templates.find((x) => x.id === tplId) ?? templates[0]
  const [preview, setPreview] = useState("")
  useEffect(() => {
    let on = true
    renderOverlay(p, t, 900, window.devicePixelRatio).then(
      (c) => on && setPreview(c.toDataURL("image/jpeg", 0.85)),
    )
    return () => {
      on = false
    }
  }, [p, t])

  const upd = (patch: Partial<Template>) =>
    setTemplates((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, ...patch } : x)),
    )
  const Check = ({
    k,
    label,
  }: {
    k: "showAddress" | "showCoords" | "showDate" | "showBadge"
    label: string
  }) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="accent-[#f5b544]"
        checked={t[k]}
        onChange={(e) => upd({ [k]: e.target.checked })}
      />
      {label}
    </label>
  )

  return (
    <div className="space-y-4">
      {preview && <img src={preview} className="w-full rounded-lg" />}
      <div className="flex gap-2">
        <select
          className="field"
          value={t.id}
          onChange={(e) => setTplId(e.target.value)}
        >
          {templates.map((x) => (
            <option key={x.id} value={x.id} className="bg-neutral-900">
              {x.name}
            </option>
          ))}
        </select>
        <button
          className="btn-ghost"
          title="Duplicate template"
          onClick={() => {
            const n = { ...t, id: crypto.randomUUID(), name: `${t.name} copy` }
            setTemplates((ts) => [...ts, n])
            setTplId(n.id)
          }}
        >
          <Plus size={14} />
        </button>
        <button
          className="btn-ghost"
          title="Delete template"
          disabled={templates.length < 2}
          onClick={() => {
            const remaining = templates.filter((x) => x.id !== t.id)
            setTemplates(remaining)
            setTplId(remaining[0]?.id ?? "")
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div>
        <label className="label">Template name</label>
        <input
          className="field"
          value={t.name}
          onChange={(e) => upd({ name: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Headline</label>
        <input
          className="field"
          value={t.title}
          onChange={(e) => upd({ title: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Check k="showAddress" label="Address" />
        <Check k="showCoords" label="Coordinates" />
        <Check k="showDate" label="Date & time" />
        <Check k="showBadge" label="GeoSnap badge" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Opacity</label>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            className="w-full accent-[#f5b544]"
            value={t.opacity}
            onChange={(e) => upd({ opacity: +e.target.value })}
          />
        </div>
        <div>
          <label className="label">Size</label>
          <input
            type="range"
            min={0.6}
            max={1.5}
            step={0.05}
            className="w-full accent-[#f5b544]"
            value={t.size}
            onChange={(e) => upd({ size: +e.target.value })}
          />
        </div>
        <div>
          <label className="label">Accent</label>
          <input
            type="color"
            className="h-8 w-full rounded bg-transparent"
            value={t.accent}
            onChange={(e) => upd({ accent: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Templates are saved automatically. The selected template is used for the
        Visual Overlay export.
      </p>
    </div>
  )
}

function ActivityDialog({
  activities,
  onClear,
  onClose,
}: {
  activities: Activity[]
  onClear: () => void
  onClose: () => void
}) {
  const kindBadge: Record<Activity["kind"], { bg: string; text: string }> = {
    import: { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-400" },
    edit: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-400" },
    revert: {
      bg: "bg-purple-500/15 border-purple-500/30",
      text: "text-purple-400",
    },
    export: {
      bg: "bg-emerald-500/15 border-emerald-500/30",
      text: "text-emerald-400",
    },
  }

  return (
    <Modal title="Session activity" onClose={onClose} wide>
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <p className="text-xs text-neutral-400">
          In-memory session log · Cleared on refresh or reset and never saved to
          disk or server.
        </p>
        {activities.length > 0 && (
          <button
            className="btn-ghost text-xs text-neutral-400 hover:text-white"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">
        {!activities.length ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No activity recorded in this session yet.
          </p>
        ) : (
          activities.map((a) => {
            const badge = kindBadge[a.kind]
            return (
              <div
                key={a.id}
                className="grid grid-cols-[80px_70px_1fr] items-baseline gap-3 rounded-md border border-white/5 bg-white/[0.01] px-3 py-2 text-xs"
              >
                <span className="font-mono text-neutral-500">
                  {new Date(a.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className={`inline-block rounded border px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase ${badge.bg} ${badge.text}`}
                >
                  {a.kind}
                </span>
                <span className="break-words text-neutral-300">{a.text}</span>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Privacy notice" onClose={onClose}>
      <div className="space-y-4 text-sm text-neutral-300">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-emerald-200/90">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-400" />
          <div className="text-xs leading-relaxed">
            Photos are kept strictly in browser memory. Originals are never
            touched, and no files leave your computer.
          </div>
        </div>
        <p className="text-xs leading-relaxed text-neutral-400">
          GeoSnap processes your photos entirely in this browser. Nothing is
          uploaded or stored on a server, and photos are cleared when you
          refresh or close the page. The map loads tiles from OpenStreetMap, so
          OpenStreetMap receives requests for the area you're viewing (not your
          photos). Templates and preferences are saved in this browser's
          localStorage.
        </p>
        <div className="pt-2">
          <button className="btn-primary w-full" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className={`w-full ${
          wide ? "max-w-3xl" : "max-w-md"
        } rounded-xl border border-white/10 bg-[#141518] p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
