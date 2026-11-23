// Lógica pura (sin Firebase) de las notificaciones: a quién se envía y qué dice cada mensaje.
// Está separada de index.js para poder probarla con `npm test`.

const recortar = (texto, max) => {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};

function mensajeAlerta(id, a) {
  const importante = a.categoria === "importante";
  return {
    titulo: `${importante ? "⚠️ " : "🔔 "}${recortar(a.titulo, 70)}`,
    cuerpo: recortar(a.descripcion, 140),
    ruta: "/alertas",
    tag: `alerta-${id}`,
  };
}

function mensajeCupon(id, c) {
  return {
    titulo: `🎟️ Nuevo cupón: ${recortar(c.titulo, 60)}`,
    cuerpo: recortar([c.aliado, c.descripcion].filter(Boolean).join(" · "), 140),
    ruta: "/cupones",
    tag: `cupon-${id}`,
  };
}

function mensajeRegistro(u) {
  return {
    titulo: "👤 Nuevo registro por aprobar",
    cuerpo: recortar(`${u.nombre} · ${u.conjunto} · Torre ${u.torre} · Apto ${u.apartamento}`, 140),
    ruta: "/admin/usuarios",
    tag: "registro-nuevo",
  };
}

const mensajeAprobado = () => ({
  titulo: "🎉 ¡Tu cuenta fue aprobada!",
  cuerpo: "Ya puedes ver las alertas y los cupones de tu comunidad.",
  ruta: "/inicio",
  tag: "cuenta-aprobada",
});

// Quién recibe una alerta: residentes aprobados del conjunto indicado (o de todos) y los administradores.
function destinatariosAlerta(usuarios, alerta) {
  const todos = !alerta.conjunto || alerta.conjunto === "todos";
  return usuarios.filter((u) => u.rol === "admin" || (u.estado === "activo" && (todos || u.conjunto === alerta.conjunto)));
}
// Un cupón llega a todos los residentes aprobados (y a los administradores).
const destinatariosCupon = (usuarios) => usuarios.filter((u) => u.rol === "admin" || u.estado === "activo");

// [{ uid, token }] sin tokens repetidos.
function tokensDe(usuarios) {
  const vistos = new Set();
  const salida = [];
  for (const u of usuarios) {
    for (const token of u.tokens || []) {
      if (typeof token !== "string" || !token || vistos.has(token)) continue;
      vistos.add(token);
      salida.push({ uid: u.uid, token });
    }
  }
  return salida;
}

// Mensaje de FCM: "notification" para que Android lo muestre solo con la app cerrada,
// y "data" para que el navegador (sw.js) y la app sepan qué abrir al tocarlo.
function armarPayload(m) {
  return {
    notification: { title: m.titulo, body: m.cuerpo },
    data: { titulo: m.titulo, cuerpo: m.cuerpo, ruta: m.ruta, url: `./#${m.ruta}`, tag: m.tag },
    android: {
      priority: "high",
      notification: { channelId: "titi_alertas", icon: "ic_stat_titi", color: "#2F7D3C", tag: m.tag },
    },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  };
}

const TOKEN_MUERTO = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);
const esTokenMuerto = (codigo) => TOKEN_MUERTO.has(codigo);

const en = (lista, n) => {
  const trozos = [];
  for (let i = 0; i < lista.length; i += n) trozos.push(lista.slice(i, i + n));
  return trozos;
};

module.exports = {
  recortar, mensajeAlerta, mensajeCupon, mensajeRegistro, mensajeAprobado,
  destinatariosAlerta, destinatariosCupon, tokensDe, armarPayload, esTokenMuerto, en,
};
