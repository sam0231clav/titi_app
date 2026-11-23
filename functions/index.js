// Cloud Functions de Titi.
//  - Al crearse una alerta o un cupón → notificación push a los teléfonos (app cerrada o abierta).
//  - Al registrarse alguien → aviso a los administradores. Al aprobarlo → aviso a esa persona.
//  - restablecerClave → el administrador asigna una clave temporal a un residente.
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const M = require("./mensajes");

// IMPORTANTE: usa la MISMA región que tu base de datos de Firestore.
//   Firestore en nam5 / us-central → "us-central1"      Firestore en southamerica-east1 → "southamerica-east1"
// (si la cambias, cambia también `regionFunciones` en src/js/config.js)
const REGION = "us-central1";
setGlobalOptions({ region: REGION, maxInstances: 5, memory: "256MiB" });

initializeApp();
const db = getFirestore();

async function cargarUsuarios() {
  const [activos, admins] = await Promise.all([
    db.collection("usuarios").where("estado", "==", "activo").get(),
    db.collection("usuarios").where("rol", "==", "admin").get(),
  ]);
  const porId = new Map();
  for (const d of [...activos.docs, ...admins.docs]) porId.set(d.id, { uid: d.id, ...d.data() });
  return [...porId.values()];
}

async function enviar(usuarios, mensaje) {
  const destinos = M.tokensDe(usuarios);
  if (!destinos.length) { logger.info("Sin teléfonos registrados para notificar", { mensaje: mensaje.titulo }); return; }
  const payload = M.armarPayload(mensaje);
  let ok = 0;
  const muertos = [];
  for (const grupo of M.en(destinos, 500)) {
    const r = await getMessaging().sendEachForMulticast({ tokens: grupo.map((g) => g.token), ...payload });
    ok += r.successCount;
    r.responses.forEach((x, i) => { if (!x.success && M.esTokenMuerto(x.error?.code)) muertos.push(grupo[i]); });
  }
  // Teléfonos que ya no existen (app desinstalada): se limpian para no seguir enviándoles.
  await Promise.all(muertos.map((m) => db.collection("usuarios").doc(m.uid).update({ tokens: FieldValue.arrayRemove(m.token) }).catch(() => {})));
  logger.info(`Notificación "${mensaje.titulo}": ${ok} enviadas de ${destinos.length}`, { limpiados: muertos.length });
}

exports.alCrearAlerta = onDocumentCreated("alertas/{id}", async (event) => {
  const a = event.data?.data();
  if (!a) return;
  const usuarios = M.destinatariosAlerta(await cargarUsuarios(), a);
  await enviar(usuarios, M.mensajeAlerta(event.params.id, a));
});

exports.alCrearCupon = onDocumentCreated("cupones/{id}", async (event) => {
  const c = event.data?.data();
  if (!c || c.vigente === false) return;
  await enviar(M.destinatariosCupon(await cargarUsuarios()), M.mensajeCupon(event.params.id, c));
});

exports.alRegistrarse = onDocumentCreated("usuarios/{uid}", async (event) => {
  const u = event.data?.data();
  if (!u || u.rol === "admin") return;
  const admins = (await db.collection("usuarios").where("rol", "==", "admin").get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
  await enviar(admins, M.mensajeRegistro(u));
});

exports.alAprobar = onDocumentUpdated("usuarios/{uid}", async (event) => {
  const antes = event.data?.before.data();
  const despues = event.data?.after.data();
  if (!antes || !despues) return;
  if (antes.estado !== "activo" && despues.estado === "activo") await enviar([{ uid: event.params.uid, ...despues }], M.mensajeAprobado());
});

// Solo un administrador puede asignar una clave temporal a otra persona.
exports.restablecerClave = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const yo = await db.collection("usuarios").doc(request.auth.uid).get();
  if (!yo.exists || yo.data().rol !== "admin") throw new HttpsError("permission-denied", "Solo un administrador puede hacer esto.");
  const { uid, clave } = request.data || {};
  if (typeof uid !== "string" || !uid) throw new HttpsError("invalid-argument", "Falta la persona.");
  if (typeof clave !== "string" || clave.length < 6 || clave.length > 64) throw new HttpsError("invalid-argument", "La clave debe tener entre 6 y 64 caracteres.");
  const destino = await db.collection("usuarios").doc(uid).get();
  if (!destino.exists) throw new HttpsError("not-found", "Esa persona no existe.");
  await getAuth().updateUser(uid, { password: clave });
  await getAuth().revokeRefreshTokens(uid);
  logger.info("Clave restablecida", { por: request.auth.uid, para: uid });
  return { ok: true };
});
