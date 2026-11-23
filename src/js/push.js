// Notificaciones push.
//  - En el APK (Android): plugin nativo de Capacitor + Firebase Cloud Messaging.
//  - En el navegador / app instalada (PWA): Web Push con Firebase Cloud Messaging y el service worker (sw.js).
// El envío lo hace la Cloud Function de /functions cuando el administrador crea una alerta o un cupón.
import { Capacitor } from "@capacitor/core";
import { CONFIG } from "./config.js";
import { lsGet, lsSet, lsDel } from "./store.js";

const CLAVE_TOKEN = "titi_push_token";
export const esNativa = () => Capacitor.isNativePlatform();

// 'granted' | 'denied' | 'default' | 'no-soportado'
export async function estadoPush(store) {
  if (store.modo !== "firebase") return "no-soportado";
  if (esNativa()) {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const r = await PushNotifications.checkPermissions();
    return r.receive === "granted" ? "granted" : r.receive === "denied" ? "denied" : "default";
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) || !CONFIG.vapidKey) return "no-soportado";
  return Notification.permission;
}

async function guardar(store, uid, token) {
  const marca = `${uid}:${token}`;
  if (lsGet(CLAVE_TOKEN) === marca) return;
  await store.guardarToken(uid, token);
  lsSet(CLAVE_TOKEN, marca);
}

async function activarNativa(store, uid, alAbrir) {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let p = await PushNotifications.checkPermissions();
  if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PushNotifications.requestPermissions();
  if (p.receive !== "granted") return false;
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", (t) => guardar(store, uid, t.value).catch((e) => console.warn("token", e)));
  await PushNotifications.addListener("registrationError", (e) => console.warn("push", e));
  await PushNotifications.addListener("pushNotificationActionPerformed", (a) => alAbrir?.(a.notification?.data?.ruta));
  try {
    await PushNotifications.createChannel({
      id: "titi_alertas", name: "Alertas y cupones", description: "Avisos de tu comunidad",
      importance: 5, visibility: 1, vibration: true, lights: true,
    });
  } catch { /* el canal ya existe */ }
  await PushNotifications.register();
  return true;
}

async function activarWeb(store, uid) {
  const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
  if (!(await isSupported())) return false;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission !== "granted") return false;
  const registro = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(store.app), { vapidKey: CONFIG.vapidKey, serviceWorkerRegistration: registro });
  if (!token) return false;
  await guardar(store, uid, token);
  return true;
}

// pedirPermiso=true solo cuando la persona toca "Activar" (los navegadores bloquean pedirlo solos).
export async function activarPush(store, uid, { alAbrir, pedirPermiso = false } = {}) {
  try {
    const estado = await estadoPush(store);
    if (estado === "no-soportado" || estado === "denied") return false;
    if (esNativa()) return await activarNativa(store, uid, alAbrir);
    if (estado === "default" && !pedirPermiso) return false;
    return await activarWeb(store, uid);
  } catch (e) {
    console.warn("No se pudo activar push:", e);
    return false;
  }
}

// Al cerrar sesión: este teléfono deja de recibir los avisos de esa cuenta.
export async function quitarPush(store, uid) {
  const marca = lsGet(CLAVE_TOKEN);
  lsDel(CLAVE_TOKEN);
  if (!marca || !uid) return;
  const token = marca.slice(marca.indexOf(":") + 1);
  await store.quitarToken(uid, token).catch(() => {});
}
