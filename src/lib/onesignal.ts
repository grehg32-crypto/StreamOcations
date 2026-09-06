import { Capacitor } from "@capacitor/core";
import OneSignal from "onesignal-cordova-plugin";
import type { Streamer } from "./stream-types";

export const ONESIGNAL_APP_ID = "ff0718d1-7f64-43b5-9c01-f3116326117f";
const EXTERNAL_ID_KEY = "stream_ocations_onesignal_external_id_v1";

function getOrCreateExternalId(): string {
  try {
    const existing = localStorage.getItem(EXTERNAL_ID_KEY);
    if (existing) return existing;

    const id = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(EXTERNAL_ID_KEY, id);
    return id;
  } catch {
    return `device-${Date.now()}`;
  }
}

function tagName(streamer: Streamer): string {
  const username = streamer.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `follow_${streamer.platform}_${username}`;
}

export function isNativeOneSignalAvailable(): boolean {
  return Capacitor.isNativePlatform() && ONESIGNAL_APP_ID !== "TU_ID_DE_ONESIGNAL_AQUÍ";
}

let initialization: Promise<void> | null = null;

export async function initializeOneSignal(): Promise<void> {
  if (initialization) return initialization;

  initialization = (async () => {

    if (!Capacitor.isNativePlatform()) return;
    if (ONESIGNAL_APP_ID === "TU_ID_DE_ONESIGNAL_AQUÍ") {
      console.warn("Stream Ocations: reemplaza ONESIGNAL_APP_ID antes de compilar la APK.");
      return;
    }

    try {
      OneSignal.initialize(ONESIGNAL_APP_ID);

      // Solicitud explícita durante las pruebas. Para producción, OneSignal recomienda
      // considerar un flujo previo/in-app antes del prompt nativo.
      await OneSignal.Notifications.requestPermission(true);

      const externalId = getOrCreateExternalId();
      await OneSignal.login(externalId);
    } catch (error) {
      console.error("No se pudo inicializar OneSignal", error);
    }
  })();

  return initialization;
}

/**
 * Sincroniza los streamers favoritos como Tags de OneSignal.
 * Los tags sirven para segmentar el envío desde el backend/REST API de OneSignal;
 * por sí solos NO consultan Twitch/Kick ni generan notificaciones.
 */
export async function syncStreamerTags(streamers: Streamer[]): Promise<void> {
  if (!isNativeOneSignalAvailable()) return;
  await initializeOneSignal();

  try {
    const desired = new Set(streamers.map(tagName));
    const raw = localStorage.getItem("stream_ocations_onesignal_tags_v1");
    const previous = raw ? (JSON.parse(raw) as string[]) : [];

    const removed = previous.filter((tag) => !desired.has(tag));
    if (removed.length > 0) {
      await OneSignal.User.removeTags(removed);
    }

    if (streamers.length > 0) {
      const tags: Record<string, string> = {};
      for (const streamer of streamers) {
        tags[tagName(streamer)] = "1";
      }
      await OneSignal.User.addTags(tags);
    }

    localStorage.setItem("stream_ocations_onesignal_tags_v1", JSON.stringify([...desired]));
  } catch (error) {
    console.error("No se pudieron sincronizar los tags de OneSignal", error);
  }
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (ONESIGNAL_APP_ID === "TU_ID_DE_ONESIGNAL_AQUÍ") return false;

  try {
    await initializeOneSignal();
    return await OneSignal.Notifications.requestPermission(true);
  } catch {
    return false;
  }
}
