import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Play, Square, Trash2, Radio, Plus, RefreshCw } from "lucide-react";
import { checkStreamers } from "@/lib/check-streams";
import {
  defaultAvatar,
  formatNumber,
  formatTimeAgo,
  formatUptime,
  profileUrl,
  streamerKey,
  type Platform,
  type StatusMap,
  type Streamer,
} from "../lib/stream-types";
import { loadAuto, loadStatus, loadStreamers, saveAll } from "../lib/stream-store";
import { requestNativeNotificationPermission, syncStreamerTags } from "../lib/onesignal";

const CHECK_INTERVAL = 60_000;

function notify(title: string, body: string, url?: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: title });
    n.onclick = () => {
      if (url) window.open(url, "_blank");
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export function StreamNotifier() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [status, setStatus] = useState<StatusMap>({});
  const [auto, setAuto] = useState(false);
  const [checking, setChecking] = useState(false);
  const [bar, setBar] = useState("Cargando...");
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [hydrated, setHydrated] = useState(false);

  const streamersRef = useRef(streamers);
  const statusRef = useRef(status);
  const checkingRef = useRef(false);
  streamersRef.current = streamers;
  statusRef.current = status;

  useEffect(() => {
    const s = loadStreamers();
    const st = loadStatus();
    const a = loadAuto();
    setStreamers(s);
    setStatus(st);
    setAuto(a);
    setHydrated(true);
    void syncStreamerTags(s);
    setBar(a ? "Auto-check activo" : "Listo");
  }, []);

  const persist = useCallback((s: Streamer[], st: StatusMap, a: boolean) => {
    saveAll(s, st, a);
  }, []);

  const runCheck = useCallback(
    async (show = true) => {
      const list = streamersRef.current;
      if (checkingRef.current) return;
      if (list.length === 0) {
        if (show) setBar("No hay streamers para revisar");
        return;
      }
      checkingRef.current = true;
      setChecking(true);
      if (show) setBar("Revisando streamers...");

      try {
        const results = await checkStreamers(list);
        const prev = statusRef.current;
        const next: StatusMap = { ...prev };

        for (const s of list) {
          const key = streamerKey(s);
          const result = results[key];
          const old = prev[key];
          if (!result) continue;

          if (result.isLive === null) {
            next[key] = { ...(old || {}), error: true, isLive: old?.isLive ?? null };
            continue;
          }

          if (old && old.isLive === false && result.isLive === true) {
            const gamePart = result.game ? ` · ${result.game}` : "";
            notify(
              `${s.username} esta EN VIVO`,
              (result.title || "Acaba de empezar") + gamePart,
              result.url,
            );
          } else if (old && old.isLive === true && result.isLive === false) {
            notify(`${s.username} se desconecto`, `El stream de ${s.platform} termino`, result.url);
          } else if (old && old.isLive === true && result.isLive === true) {
            const oldG = (old.game || "").trim().toLowerCase();
            const newG = (result.game || "").trim().toLowerCase();
            if (oldG && newG && oldG !== newG) {
              notify(`${s.username} cambio de categoria`, `${old.game} → ${result.game}`, result.url);
            }
          }

          let lastLiveAt = old?.lastLiveAt || null;
          if (result.isLive === true) lastLiveAt = result.startedAt || new Date().toISOString();
          else if (old?.isLive === true && result.isLive === false) lastLiveAt = new Date().toISOString();

          next[key] = {
            ...result,
            error: false,
            avatar: result.avatar || old?.avatar,
            lastLiveAt,
          };
        }

        setStatus(next);
        persist(list, next, auto);
        const now = new Date().toLocaleTimeString();
        setBar(auto ? `Auto-check activo · ${now}` : `Ultima revision: ${now}`);
      } catch {
        setBar("Error al revisar. Intenta de nuevo.");
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [auto, persist],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (streamers.length > 0) void runCheck(true);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated || !auto) return;
    const id = window.setInterval(() => {
      void runCheck(false);
    }, CHECK_INTERVAL);
    return () => window.clearInterval(id);
  }, [hydrated, auto, runCheck]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && auto) void runCheck(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [auto, runCheck]);

  const liveCount = useMemo(
    () => streamers.filter((s) => status[streamerKey(s)]?.isLive === true).length,
    [streamers, status],
  );

  async function enableNotifications() {
    const nativeAccepted = await requestNativeNotificationPermission();
    if (nativeAccepted) {
      setPerm("granted");
      setBar("Notificaciones push activadas");
      return;
    }

    if (typeof Notification === "undefined") {
      setBar("Este entorno no soporta notificaciones web");
      return;
    }

    const result = await Notification.requestPermission();
    setPerm(result);
    setBar(result === "granted" ? "Notificaciones activadas" : "Permiso denegado");
    if (result === "granted") notify("Stream Notifier", "Notificaciones activadas");
  }

  function addStreamer() {
    let name = username.trim().toLowerCase();
    name = name.replace(/^https?:\/\/(www\.)?(twitch\.tv|kick\.com)\//i, "");
    name = name.replace(/[^a-z0-9_]/gi, "");
    if (!name) return;
    if (streamers.some((s) => s.platform === platform && s.username === name)) {
      setBar("Ese streamer ya esta en la lista");
      return;
    }
    const next = [...streamers, { platform, username: name }];
    setStreamers(next);
    persist(next, status, auto);
    setUsername("");
    void syncStreamerTags(next);
  }

  function removeStreamer(i: number) {
    const s = streamers[i];
    const next = streamers.filter((_, idx) => idx !== i);
    const st = { ...status };
    if (s) delete st[streamerKey(s)];
    setStreamers(next);
    setStatus(st);
    persist(next, st, auto);
    void syncStreamerTags(next);
  }

  function toggleAuto() {
    const next = !auto;
    setAuto(next);
    persist(streamers, status, next);
    setBar(next ? "Auto-check activado (cada 60s)" : "Auto-check detenido");
    if (next) void runCheck(true);
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8 pb-16">
      <header className="mb-8 text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-subtle">
          Twitch · Kick
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Stream Notifier</h1>
        <p className="mt-2 text-sm text-muted">
          Avisos al encender, apagar o cambiar de categoria
        </p>
        <p className="mt-3 text-sm tabular-nums text-subtle">
          {liveCount} en vivo · {streamers.length} seguidos
        </p>
      </header>

      <section className="mb-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-fg">Controles</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void enableNotifications()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <Bell className="size-4" />
            {perm === "granted" ? "Avisos listos" : "Activar avisos"}
          </button>
          <button
            type="button"
            onClick={() => void runCheck(true)}
            disabled={checking}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-elevated px-3 text-sm font-medium text-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} />
            Revisar ahora
          </button>
          <button
            type="button"
            onClick={toggleAuto}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 ${
              auto ? "bg-live text-accent-fg" : "border border-border bg-elevated text-fg"
            }`}
          >
            {auto ? <Square className="size-4" /> : <Play className="size-4" />}
            {auto ? "Detener auto" : "Iniciar auto"}
          </button>
        </div>
        <p className="mt-3 rounded-md bg-elevated px-3 py-2 text-center text-xs text-muted">{bar}</p>
      </section>

      <section className="mb-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-fg">Agregar streamer</h2>
        <form
          className="grid grid-cols-1 gap-2 sm:grid-cols-[7.5rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            addStreamer();
          }}
        >
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="h-11 rounded-md border border-border bg-elevated px-3 text-sm text-fg"
          >
            <option value="twitch">Twitch</option>
            <option value="kick">Kick</option>
          </select>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="nombre_de_usuario"
            autoComplete="off"
            spellCheck={false}
            className="h-11 rounded-md border border-border bg-elevated px-3 text-sm text-fg placeholder:text-subtle"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            <Plus className="size-4" />
            Agregar
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-fg">Mis streamers</h2>
        {streamers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Todavia no has agregado ningun streamer
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {streamers.map((s, i) => {
              const info = status[streamerKey(s)];
              const live = info?.isLive === true;
              const error = Boolean(info?.error);
              const offline = info?.isLive === false && !error;
              const avatar = info?.avatar || defaultAvatar(s.platform);
              const href = info?.url || profileUrl(s);
              const ring =
                live && s.platform === "twitch"
                  ? "ring-2 ring-twitch"
                  : live && s.platform === "kick"
                    ? "ring-2 ring-kick"
                    : "ring-1 ring-border";
              const badge =
                s.platform === "twitch" ? "bg-twitch/20 text-twitch" : "bg-kick/15 text-kick";
              const verifiedBg = s.platform === "twitch" ? "bg-twitch" : "bg-[#1a8f0a] text-kick";

              return (
                <li
                  key={streamerKey(s)}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md bg-elevated p-3"
                >
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative size-14 shrink-0"
                    title={live ? "Ir al directo" : "Ir al perfil"}
                  >
                    <img
                      src={avatar}
                      alt=""
                      className={`size-14 rounded-full object-cover ${ring}`}
                      onError={(e) => {
                        e.currentTarget.src = defaultAvatar(s.platform);
                      }}
                    />
                    {info?.verified ? (
                      <span
                        className={`absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-elevated text-[10px] font-bold text-white ${verifiedBg}`}
                      >
                        ✓
                      </span>
                    ) : null}
                  </a>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}>
                        {s.platform}
                      </span>
                      <span className="truncate text-sm font-semibold">{s.username}</span>
                      <span
                        className={`size-2 rounded-full ${
                          live ? "bg-live" : error ? "bg-danger" : offline ? "bg-offline" : "bg-warn"
                        }`}
                      />
                      <span
                        className={`text-xs font-semibold ${
                          live
                            ? "text-live"
                            : error
                              ? "text-danger"
                              : offline
                                ? "text-muted"
                                : "text-warn"
                        }`}
                      >
                        {live
                          ? "EN VIVO"
                          : error
                            ? "Error API"
                            : offline
                              ? "Offline"
                              : "Sin verificar"}
                      </span>
                    </div>
                    {live && info?.title ? (
                      <p className="mt-0.5 truncate text-sm text-fg/90">{info.title}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {live && info?.game ? (
                        <span className="max-w-40 truncate rounded bg-bg px-2 py-0.5 text-fg">
                          {info.game}
                        </span>
                      ) : null}
                      {live && info?.viewers != null ? (
                        <span className="tabular-nums">{formatNumber(info.viewers)} viewers</span>
                      ) : null}
                      {live && info?.startedAt ? (
                        <span className="tabular-nums text-live">{formatUptime(info.startedAt)}</span>
                      ) : null}
                      {offline && info?.lastLiveAt ? (
                        <span>Ultimo directo {formatTimeAgo(info.lastLiveAt)}</span>
                      ) : null}
                      {offline && !info?.lastLiveAt ? <span>Sin historial aun</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStreamer(i)}
                    className="inline-flex h-9 items-center justify-center rounded-sm border border-danger/40 px-3 text-xs font-medium text-danger"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-fg">
          <Radio className="size-4 text-muted" />
          Instalar en el movil
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>
            No es un APK de Play Store. Es una app web instalable (PWA): icono en
            el escritorio, pantalla completa, sin tienda.
          </li>
          <li>
            <strong className="font-medium text-fg">Android:</strong> menu del
            navegador → Instalar app / Anadir a la pantalla de inicio.
          </li>
          <li>
            <strong className="font-medium text-fg">iPhone:</strong> Compartir →
            Anadir a pantalla de inicio.
          </li>
          <li>
            El auto-check se guarda. Las notificaciones del navegador llegan con
            la app abierta o en segundo plano.
          </li>
        </ul>
      </section>
    </main>
  );
}
