# Stream Ocations — Capacitor + OneSignal

Versión Client-Side Only preparada para empaquetado Android con Capacitor.

## Requisitos

- Node.js compatible con la versión actual de Capacitor
- Android Studio + Android SDK
- Un proyecto de OneSignal configurado para Android

## Instalación

```bash
npm install
```

## OneSignal

Edita `src/lib/onesignal.ts` y reemplaza:

```ts
export const ONESIGNAL_APP_ID = "ff0718d1-7f64-43b5-9c01-f3116326117f";
```

por el App ID real de OneSignal.

El proyecto registra un External ID local para cada instalación y sincroniza los streamers favoritos como Tags. Los Tags sirven para segmentar envíos; el chequeo de Twitch/Kick y la decisión de cuándo enviar un push deben ejecutarse fuera de la APK.

## Android

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Después, en Android Studio puedes ejecutar la aplicación en un dispositivo/emulador o generar el APK/AAB.
