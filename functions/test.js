const assert = require("node:assert/strict");
const M = require("./mensajes");

const usuarios = [
  { uid: "a", rol: "admin", estado: "activo", conjunto: "Piedemonte", tokens: ["t-admin"] },
  { uid: "l", rol: "usuario", estado: "activo", conjunto: "Mapire", tokens: ["t-laura", "t-laura-2"] },
  { uid: "j", rol: "usuario", estado: "activo", conjunto: "Morichal", tokens: ["t-julian"] },
  { uid: "m", rol: "usuario", estado: "pendiente", conjunto: "Morichal", tokens: ["t-maria"] },
  { uid: "x", rol: "usuario", estado: "activo", conjunto: "Zainos", tokens: [] },
  { uid: "d", rol: "usuario", estado: "activo", conjunto: "Zainos", tokens: ["t-laura", 5, ""] },
];
const toks = (l) => M.tokensDe(l).map((t) => t.token).sort();

// Alerta para todos: aprobados + admin; nunca pendientes
assert.deepEqual(toks(M.destinatariosAlerta(usuarios, { conjunto: "todos" })), ["t-admin", "t-julian", "t-laura", "t-laura-2"]);
// Alerta solo de Mapire: Laura + admin
assert.deepEqual(toks(M.destinatariosAlerta(usuarios, { conjunto: "Mapire" })), ["t-admin", "t-laura", "t-laura-2"]);
// Alerta sin conjunto se trata como "todos"
assert.equal(M.destinatariosAlerta(usuarios, {}).length, 5);
// Cupón: aprobados + admin, sin pendientes
assert.ok(!M.destinatariosCupon(usuarios).some((u) => u.uid === "m"));
// Tokens repetidos y basura se descartan, y cada token conserva su dueño
assert.equal(M.tokensDe(usuarios).filter((t) => t.token === "t-laura").length, 1);
assert.equal(M.tokensDe(usuarios).find((t) => t.token === "t-laura").uid, "l");

// Mensajes
const al = M.mensajeAlerta("abc", { titulo: "Corte de agua", descripcion: "x".repeat(300), categoria: "importante" });
assert.ok(al.titulo.startsWith("⚠️ ") && al.cuerpo.length <= 140 && al.cuerpo.endsWith("…") && al.ruta === "/alertas");
assert.ok(M.mensajeAlerta("1", { titulo: "Feria", descripcion: "Sábado", categoria: "evento" }).titulo.startsWith("🔔 "));
const cu = M.mensajeCupon("c1", { titulo: "15% en farmacia", aliado: "Farmacia San José", descripcion: "Descuento" });
assert.equal(cu.cuerpo, "Farmacia San José · Descuento");
assert.equal(M.mensajeRegistro({ nombre: "Ana", conjunto: "Arauco", torre: "4", apartamento: "401" }).ruta, "/admin/usuarios");

// Payload de FCM: todo en `data` son textos, y trae notificación para Android con la app cerrada
const p = M.armarPayload(al);
assert.ok(Object.values(p.data).every((v) => typeof v === "string"));
assert.equal(p.data.url, "./#/alertas");
assert.equal(p.notification.title, al.titulo);
assert.equal(p.android.notification.channelId, "titi_alertas");
assert.equal(p.android.priority, "high");

assert.ok(M.esTokenMuerto("messaging/registration-token-not-registered") && !M.esTokenMuerto("messaging/internal-error"));
assert.deepEqual(M.en([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
console.log("✔ Lógica de notificaciones: todas las pruebas pasaron");
