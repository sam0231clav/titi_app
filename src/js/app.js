import { CONFIG } from "./config.js";
import { crearStore } from "./store.js";
import {
  CONJUNTOS, CATEGORIAS, CLAVE_MIN, normTelefono, telefonoValido, formatoTelefono, normCodigo,
  primerNombre, fmtFecha, fmtRelativa, iniciales,
} from "./data.js";
import { esc, $, $$, aviso, hoja, confirmar, copiar, ICONOS } from "./ui.js";
import { activarPush, estadoPush, quitarPush, esNativa } from "./push.js";

const VERSION = "2.0";
const raiz = document.getElementById("app");
let store;
let usuario = null;
let turno = 0; // evita que una vista lenta pise a otra más reciente

// Datos en vivo (se actualizan solos con onSnapshot) y sus suscripciones.
const datos = { alertas: [], cupones: [], usuarios: [] };
let datosPromesa = Promise.resolve();
let bajasPerfil = [];
let bajasDatos = [];
let filtroUsuarios = { texto: "", conjunto: "", estado: "" };

// ======================= Utilidades =======================
const tieneAccesoDe = (u) => Boolean(u) && (u.estado === "activo" || u.rol === "admin");
const tieneAcceso = () => tieneAccesoDe(usuario);
const esAdmin = () => usuario?.rol === "admin";
const inicioDe = () => (!tieneAcceso() ? "/pendiente" : esAdmin() ? "/admin" : "/inicio");

function mensajeError(e) {
  const c = e?.codigo || e?.code || "";
  if (c === "credenciales") return "Celular o clave incorrectos.";
  if (c === "ya-existe") return "Ese celular ya está registrado. Ingresa con tu clave.";
  if (c === "clave-debil") return `La clave debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (c === "demasiados") return "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
  if (c === "red") return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  if (c === "config") return "Falta activar el ingreso con correo y contraseña en Firebase (Authentication → Método de acceso).";
  if (c === "permission-denied") return "Sin permiso. Revisa que las reglas de Firestore estén publicadas.";
  return "No se pudo completar. Intenta de nuevo.";
}

function pantallaError(msg, alReintentar) {
  raiz.innerHTML = `<div class="acceso"><img class="logo chico" src="assets/logo.png" alt="Titi" /><h1>No pudimos conectarnos</h1>
    <p class="lema">${esc(msg)}</p><button class="btn btn-primario" id="reintentar">Reintentar</button></div>`;
  $("#reintentar").onclick = alReintentar;
}

// ======================= Arranque =======================
async function arrancar() {
  try {
    store = await crearStore();
    const uid = await store.auth.esperar();
    if (uid) await abrirSesion(uid);
  } catch (e) {
    console.error(e);
    return pantallaError("Revisa tu conexión a internet y la configuración de Firebase.", arrancar);
  }
  if ("serviceWorker" in navigator && !esNativa()) navigator.serviceWorker.register("./sw.js").catch(() => {});
  window.addEventListener("hashchange", () => enrutar());
  enrutar();
}

async function abrirSesion(uid) {
  const u = await store.get("usuarios", uid);
  if (!u) { await store.auth.salir().catch(() => {}); return false; }
  usuario = u;
  escucharPerfil(uid);
  if (tieneAcceso()) escucharDatos();
  iniciarPush();
  return true;
}

async function cerrarSesion() {
  const uid = usuario?.id;
  await quitarPush(store, uid);
  dejarDatos();
  bajasPerfil.forEach((b) => b());
  bajasPerfil = [];
  usuario = null;
  filtroUsuarios = { texto: "", conjunto: "", estado: "" };
  await store.auth.salir().catch(() => {});
}

// Tu propio perfil se escucha en vivo: así la pantalla de espera cambia sola cuando te aprueban.
function escucharPerfil(uid) {
  bajasPerfil.forEach((b) => b());
  bajasPerfil = [store.observarDoc("usuarios", uid, (nuevo) => {
    if (!usuario) return;
    if (!nuevo) { cerrarSesion().then(() => ir("/login")); return; }
    const antes = usuario;
    usuario = nuevo;
    if (tieneAccesoDe(antes) !== tieneAccesoDe(nuevo) || antes.rol !== nuevo.rol || antes.conjunto !== nuevo.conjunto) {
      if (tieneAcceso()) { escucharDatos(); if (!tieneAccesoDe(antes)) aviso("¡Tu cuenta fue aprobada! 🎉"); }
      else dejarDatos();
      enrutar();
    }
  })];
}

function dejarDatos() {
  bajasDatos.forEach((b) => b());
  bajasDatos = [];
  datos.alertas = []; datos.cupones = []; datos.usuarios = [];
}

function escucharDatos() {
  dejarDatos();
  const claves = esAdmin() ? ["alertas", "cupones", "usuarios"] : ["alertas", "cupones"];
  datosPromesa = new Promise((resolver) => {
    let faltan = claves.length;
    const fin = () => { if (--faltan === 0) resolver(); };
    setTimeout(resolver, 4000); // sin conexión y sin caché: no dejar la pantalla esperando
    for (const clave of claves) {
      let inicial = true;
      bajasDatos.push(store.observar(clave, null, (lista, meta = {}) => {
        if (lista === null) { if (inicial) { inicial = false; fin(); } return; } // sin permiso o sin conexión
        const previos = new Set(datos[clave].map((x) => x.id));
        datos[clave] = lista;
        if (inicial) { inicial = false; fin(); return; }
        anunciar(clave, lista.filter((x) => !previos.has(x.id)), meta);
        refrescar();
      }));
    }
  });
  return datosPromesa;
}

// Aviso dentro de la app cuando llega algo nuevo mientras la tienes abierta.
function anunciar(clave, nuevos, meta) {
  if (meta.local || meta.cache || !nuevos.length) return;
  const reciente = (x) => Date.now() - (x.fecha || x.fechaRegistro || 0) < 5 * 60000;
  const n = nuevos.filter(reciente);
  if (!n.length) return;
  const x = n[0];
  if (clave === "alertas") aviso(`🔔 ${x.titulo}`);
  else if (clave === "cupones" && x.vigente) aviso(`🎟️ Nuevo cupón: ${x.titulo}`);
  else if (clave === "usuarios" && x.estado === "pendiente") aviso(`👤 Nuevo registro: ${x.nombre}`);
}

let tRefresco;
function refrescar() {
  clearTimeout(tRefresco);
  tRefresco = setTimeout(() => {
    if (!usuario || document.querySelector(".capa")) return;
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    const { ruta } = leerHash();
    if (ruta !== "/perfil" && !publicas.includes(ruta)) enrutar(true);
  }, 150);
}

async function iniciarPush() {
  if (!usuario) return;
  const ok = await activarPush(store, usuario.id, { alAbrir: (ruta) => ruta && ir(ruta) });
  if (ok) document.dispatchEvent(new Event("push-activo"));
}

// ======================= Enrutador =======================
function leerHash() {
  const [ruta, qs = ""] = (location.hash.replace(/^#/, "") || "/").split("?");
  return { ruta: ruta || "/", q: Object.fromEntries(new URLSearchParams(qs)) };
}
function ir(ruta) {
  const destino = "#" + ruta;
  if (location.hash === destino) enrutar();
  else location.hash = destino;
}

const rutas = {
  "/login": vistaLogin,
  "/registro": vistaRegistro,
  "/pendiente": vistaPendiente,
  "/inicio": vistaInicio,
  "/alertas": vistaAlertas,
  "/cupones": vistaCupones,
  "/perfil": vistaPerfil,
  "/admin": vistaAdminResumen,
  "/admin/usuarios": vistaAdminUsuarios,
  "/admin/alertas": vistaAdminAlertas,
  "/admin/cupones": vistaAdminCupones,
};
const publicas = ["/login", "/registro"];

async function enrutar(silencioso = false) {
  const { ruta, q } = leerHash();
  if (!usuario) {
    if (!publicas.includes(ruta)) return ir("/login");
  } else {
    if (publicas.includes(ruta)) return ir(inicioDe());
    if (!tieneAcceso() && ruta !== "/pendiente") return ir("/pendiente");
    if (tieneAcceso() && ruta === "/pendiente") return ir(inicioDe());
    if (ruta.startsWith("/admin") && !esAdmin()) return ir("/inicio");
  }
  const vista = rutas[ruta];
  if (!vista) return ir(usuario ? inicioDe() : "/login");
  const mio = ++turno;
  const y = window.scrollY;
  try {
    const salida = vista(q);
    let html = salida;
    if (salida instanceof Promise) {
      if (!silencioso && !raiz.firstElementChild) raiz.innerHTML = `<div class="cargando"><div class="giro" role="status" aria-label="Cargando"></div></div>`;
      html = await salida;
    }
    if (mio !== turno) return;
    raiz.innerHTML = html.cuerpo;
    html.montar?.();
    window.scrollTo(0, silencioso ? y : 0);
  } catch (e) {
    console.error(e);
    if (mio !== turno) return;
    pantallaError(e.message || "Error inesperado", () => enrutar());
  }
}

// ======================= Plantillas comunes =======================
function navegacion(activa, items) {
  return `<nav class="nav" aria-label="Navegación principal">${items
    .map(
      (i) => `<a href="#${i.ruta}" class="${i.ruta === activa ? "on" : ""}" ${i.ruta === activa ? 'aria-current="page"' : ""}>
        ${ICONOS[i.icono]}<span>${i.texto}</span>${i.badge ? `<em class="badge">${i.badge}</em>` : ""}</a>`
    )
    .join("")}</nav>`;
}
const itemsResidente = (nuevas = 0) => [
  { ruta: "/inicio", icono: "inicio", texto: "Inicio" },
  { ruta: "/alertas", icono: "alertas", texto: "Alertas", badge: nuevas > 0 ? (nuevas > 9 ? "9+" : nuevas) : "" },
  { ruta: "/cupones", icono: "cupones", texto: "Cupones" },
  { ruta: "/perfil", icono: "perfil", texto: "Perfil" },
];
const itemsAdmin = (pendientes = 0) => [
  { ruta: "/admin", icono: "resumen", texto: "Resumen" },
  { ruta: "/admin/usuarios", icono: "usuarios", texto: "Usuarios", badge: pendientes > 0 ? (pendientes > 9 ? "9+" : pendientes) : "" },
  { ruta: "/admin/alertas", icono: "alertas", texto: "Alertas" },
  { ruta: "/admin/cupones", icono: "cupones", texto: "Cupones" },
  { ruta: "/perfil", icono: "perfil", texto: "Perfil" },
];
const contarPendientes = () => datos.usuarios.filter((u) => u.rol !== "admin" && u.estado !== "activo").length;
const navAdmin = (activa) => navegacion(activa, itemsAdmin(contarPendientes()));
const cabecera = (titulo, sub = "", { corta = false, accion = "" } = {}) => `
  <header class="cabecera ${corta ? "corta" : ""}">
    <img src="assets/icon-192.png" alt="Titi" />
    <div><h1>${titulo}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
    <div class="espacio"></div>${accion}
  </header>`;

function campoClave(nombre, etiqueta, autocompletar) {
  return `<label class="campo"><span>${etiqueta}</span><div class="clave">
    <input class="entrada" type="password" name="${nombre}" autocomplete="${autocompletar}" maxlength="64" required />
    <button type="button" class="ojo" data-ojo aria-label="Mostrar u ocultar la clave">${ICONOS.ojo}</button></div></label>`;
}
function enlazarOjos(raizEl = document) {
  $$("[data-ojo]", raizEl).forEach((b) => b.addEventListener("click", () => {
    const i = b.previousElementSibling;
    i.type = i.type === "password" ? "text" : "password";
  }));
}

// ======================= Datos compartidos =======================
const alertasVisibles = () =>
  datos.alertas
    .filter((a) => esAdmin() || a.conjunto === "todos" || a.conjunto === usuario.conjunto)
    .sort((a, b) => b.fecha - a.fecha);
const cuponVigente = (c) => c.vigente && (!c.vence || c.vence > Date.now());
const contarNuevas = (alertas) => alertas.filter((a) => a.fecha > (usuario.alertasVistasHasta || 0)).length;

// Tarjeta para activar las notificaciones (se rellena sola según el permiso del teléfono).
function ranuraPush() { return `<div id="ranura-push"></div>`; }
async function montarPush() {
  const ranura = $("#ranura-push");
  if (!ranura) return;
  const dibujar = async () => {
    const el = $("#ranura-push");
    if (!el) return;
    const estado = await estadoPush(store);
    if (estado === "default") {
      el.innerHTML = `<section class="tarjeta push"><div class="fila"><div><h2 style="margin:0">🔔 Activa las notificaciones</h2>
        <p class="mut peque" style="margin-top:4px">Recibe las alertas y los cupones al instante, aunque tengas la app cerrada.</p></div></div>
        <button class="btn btn-primario" id="activar-push" style="margin-top:12px">Activar notificaciones</button></section>`;
      $("#activar-push").onclick = async () => {
        const ok = await activarPush(store, usuario.id, { pedirPermiso: true, alAbrir: (r) => r && ir(r) });
        aviso(ok ? "Notificaciones activadas" : "No se pudieron activar. Revisa los permisos del teléfono.", ok ? "ok" : "error");
        dibujar();
      };
    } else if (estado === "denied") {
      el.innerHTML = `<section class="tarjeta"><p class="peque mut">🔕 Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono (Aplicaciones → Titi → Notificaciones) para enterarte al instante.</p></section>`;
    } else el.innerHTML = "";
  };
  dibujar();
}

// ======================= Acceso =======================
function vistaLogin() {
  const demo = store.modo === "demo";
  return {
    cuerpo: `<main class="acceso">
      <img class="logo" src="assets/logo.png" alt="Titi" />
      <h1 class="marca">Titi</h1>
      <p class="lema">Tu comunidad, informada<br /><small>Agrupación Social Hacienda Rosablanca</small></p>
      <form id="f-login" novalidate>
        <label class="campo"><span>Tu número de celular</span>
          <input class="entrada" name="telefono" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="Ej: 310 123 4567" required /></label>
        ${campoClave("clave", "Tu clave", "current-password")}
        <button class="btn btn-primario" type="submit">Ingresar</button>
        <p class="error-texto" id="err" role="alert"></p>
      </form>
      <div class="sep"></div>
      <a class="btn btn-borde btn-bloque" href="#/registro">Crear mi cuenta</a>
      <p class="peque mut" style="text-align:center;margin-top:12px">¿Olvidaste tu clave? Pídele a la administración que te asigne una nueva.</p>
      ${demo ? `<div class="demo"><b>Modo demostración</b> (datos solo en este dispositivo).<br />
        Administrador: <b>300 000 0000</b> · clave <b>Admin2026</b><br />Residente: <b>310 123 4567</b> · clave <b>laura123</b>
        <br /><button class="btn btn-chico btn-borde" id="reiniciar" style="margin-top:8px">Restablecer datos de prueba</button></div>` : ""}
    </main>`,
    montar() {
      enlazarOjos();
      $("#f-login").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const tel = normTelefono(f.get("telefono"));
        const clave = String(f.get("clave") || "");
        const err = $("#err");
        if (!telefonoValido(tel)) { err.textContent = "Escribe un celular válido de 10 dígitos (empieza por 3)."; return; }
        if (!clave) { err.textContent = "Escribe tu clave."; return; }
        const btn = e.submitter; btn.disabled = true; err.textContent = "";
        try {
          const uid = await store.auth.ingresar(tel, clave);
          if (!(await abrirSesion(uid))) { err.textContent = "Tu registro fue eliminado. Crea tu cuenta de nuevo."; btn.disabled = false; return; }
          aviso(`¡Hola, ${primerNombre(usuario.nombre)}!`);
          ir(inicioDe());
        } catch (er) { if (!er?.codigo) console.error(er); err.textContent = mensajeError(er); btn.disabled = false; }
      });
      $("#reiniciar")?.addEventListener("click", async () => {
        if (await confirmar("¿Restablecer los datos de demostración?", "Restablecer", true)) { store.reiniciar(); aviso("Datos restablecidos"); }
      });
    },
  };
}

function vistaRegistro() {
  return {
    cuerpo: `<main class="acceso">
      <img class="logo chico" src="assets/logo.png" alt="Titi" />
      <h1>Crea tu cuenta</h1>
      <p class="lema">Un administrador la aprobará para que veas la información de tu comunidad</p>
      <form id="f-reg" novalidate>
        <label class="campo"><span>Conjunto</span>
          <select class="entrada" name="conjunto" required><option value="">Selecciona tu conjunto</option>
          ${CONJUNTOS.map((c) => `<option>${esc(c.nombre)}</option>`).join("")}</select></label>
        <label class="campo"><span>Nombre completo</span>
          <input class="entrada" name="nombre" autocomplete="name" maxlength="60" placeholder="Ej: Laura Gómez" required /></label>
        <div class="dos">
          <label class="campo"><span>Torre</span><input class="entrada" name="torre" maxlength="8" placeholder="Ej: 3" required /></label>
          <label class="campo"><span>Apartamento</span><input class="entrada" name="apartamento" maxlength="8" placeholder="Ej: 502" required /></label>
        </div>
        <label class="campo"><span>Celular</span>
          <input class="entrada" name="telefono" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="Ej: 310 123 4567" required /></label>
        ${campoClave("clave", `Crea una clave (mínimo ${CLAVE_MIN} caracteres)`, "new-password")}
        ${campoClave("clave2", "Repite la clave", "new-password")}
        <label class="chk"><input type="checkbox" name="acepto" />
          <span>Autorizo a la Agrupación Social Hacienda Rosablanca a tratar mis datos personales para enviarme información y beneficios de la comunidad.</span></label>
        <button class="btn btn-primario" type="submit">Crear cuenta</button>
        <p class="error-texto" id="err" role="alert"></p>
      </form>
      <div class="sep"></div>
      <a class="btn btn-borde btn-bloque" href="#/login">Ya tengo cuenta</a>
    </main>`,
    montar() {
      enlazarOjos();
      $("#f-reg").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const d = {
          conjunto: String(f.get("conjunto") || ""),
          nombre: String(f.get("nombre") || "").trim().replace(/\s+/g, " "),
          torre: String(f.get("torre") || "").trim(),
          apartamento: String(f.get("apartamento") || "").trim(),
          telefono: normTelefono(f.get("telefono")),
          clave: String(f.get("clave") || ""),
          clave2: String(f.get("clave2") || ""),
        };
        const err = $("#err");
        err.textContent = "";
        if (!d.conjunto) return void (err.textContent = "Selecciona tu conjunto.");
        if (d.nombre.length < 3) return void (err.textContent = "Escribe tu nombre completo.");
        if (!d.torre || !d.apartamento) return void (err.textContent = "Escribe tu torre y tu apartamento.");
        if (!telefonoValido(d.telefono)) return void (err.textContent = "Escribe un celular válido de 10 dígitos (empieza por 3).");
        if (d.clave.length < CLAVE_MIN) return void (err.textContent = `La clave debe tener al menos ${CLAVE_MIN} caracteres.`);
        if (d.clave !== d.clave2) return void (err.textContent = "Las dos claves no coinciden.");
        if (!f.get("acepto")) return void (err.textContent = "Debes autorizar el tratamiento de tus datos para continuar.");
        const btn = e.submitter; btn.disabled = true;
        try {
          const ahora = Date.now();
          const uid = await store.auth.registrar(d.telefono, d.clave, {
            nombre: d.nombre, conjunto: d.conjunto, torre: d.torre, apartamento: d.apartamento, telefono: d.telefono,
            rol: "usuario", estado: "pendiente", fechaRegistro: ahora, alertasVistasHasta: ahora, tokens: [],
          });
          await abrirSesion(uid);
          aviso("¡Cuenta creada! Falta la aprobación de un administrador");
          ir("/pendiente");
        } catch (er) { if (!er?.codigo) console.error(er); err.textContent = mensajeError(er); btn.disabled = false; }
      });
    },
  };
}

// Mientras un administrador no apruebe la cuenta, la persona solo ve esta pantalla.
function vistaPendiente() {
  const u = usuario;
  return {
    cuerpo: `<main class="acceso pendiente">
      <img class="logo chico" src="assets/logo.png" alt="Titi" />
      <div class="reloj" aria-hidden="true">⏳</div>
      <h1>¡Ya casi, ${esc(primerNombre(u.nombre))}!</h1>
      <p class="lema" style="margin-bottom:14px">Tu cuenta está <b>pendiente de aprobación</b>.<br />
        Espera a que un administrador te apruebe para que puedas ver la información de tu comunidad.</p>
      <section class="tarjeta"><p class="peque"><b>Conjunto:</b> ${esc(u.conjunto)}<br /><b>Torre:</b> ${esc(u.torre)} · <b>Apartamento:</b> ${esc(u.apartamento)}<br />
        <b>Celular:</b> ${esc(formatoTelefono(u.telefono))}</p>
        <p class="peque mut" style="margin-top:8px">La administración verifica tu torre y apartamento. Esta pantalla cambia sola cuando te aprueben.</p></section>
      ${ranuraPush()}
      <button class="btn btn-borde btn-bloque" id="actualizar">Actualizar estado</button>
      <button class="btn btn-bloque" id="salir" style="margin-top:8px;color:var(--mut)">${ICONOS.salir} Cerrar sesión</button>
    </main>`,
    montar() {
      montarPush();
      $("#actualizar").onclick = async () => {
        try {
          const nuevo = await store.get("usuarios", usuario.id);
          if (nuevo) { const antes = usuario; usuario = nuevo; if (tieneAccesoDe(nuevo) && !tieneAccesoDe(antes)) { escucharDatos(); aviso("¡Tu cuenta fue aprobada! 🎉"); return enrutar(); } }
          aviso("Sigue pendiente de aprobación");
        } catch { aviso("No se pudo consultar. Revisa tu conexión.", "error"); }
      };
      $("#salir").onclick = async () => { await cerrarSesion(); aviso("Sesión cerrada"); ir("/login"); };
    },
  };
}

// ======================= Residente =======================
async function vistaInicio() {
  await datosPromesa;
  const alertas = alertasVisibles();
  const nuevas = contarNuevas(alertas);
  const disponibles = datos.cupones.filter(cuponVigente).length;
  const ultimas = alertas.slice(0, 2);
  const accion = esAdmin() ? `<a class="accion" href="#/admin" style="text-decoration:none">Volver al panel</a>` : "";
  return {
    cuerpo: `${cabecera(`Hola, ${esc(primerNombre(usuario.nombre))} 👋`, `${esc(usuario.conjunto)} · Torre ${esc(usuario.torre)} · Apto ${esc(usuario.apartamento)}`, { accion })}
    <main class="contenido solapado">
      <div class="metricas">
        <a class="metrica" href="#/alertas"><b>${nuevas}</b><span>${nuevas === 1 ? "alerta nueva" : "alertas nuevas"}</span></a>
        <a class="metrica" href="#/cupones"><b>${disponibles}</b><span>${disponibles === 1 ? "cupón disponible" : "cupones disponibles"}</span></a>
      </div>
      ${ranuraPush()}
      ${CONFIG.whatsappComunidad ? `<a class="btn btn-wa btn-bloque" style="margin-bottom:12px" target="_blank" rel="noopener" href="${esc(CONFIG.whatsappComunidad)}">${ICONOS.whatsapp} Unirme a la comunidad de WhatsApp</a>` : ""}
      <section class="tarjeta"><div class="fila"><h2 style="margin:0">Últimas alertas</h2><a href="#/alertas" class="peque" style="color:var(--green);font-weight:700">Ver todas</a></div>
        ${ultimas.length ? ultimas.map((a) => tarjetaAlerta(a, false)).join("") : `<p class="vacio">Aún no hay alertas.</p>`}</section>
    </main>
    ${navegacion("/inicio", itemsResidente(nuevas))}`,
    montar() { montarPush(); },
  };
}

function tarjetaAlerta(a, nueva) {
  const cat = CATEGORIAS[a.categoria] || CATEGORIAS.aviso;
  return `<article class="alerta"><span class="punto" style="background:${cat.color}"></span>
    <div><h3>${esc(a.titulo)} ${nueva ? '<span class="nuevo">NUEVA</span>' : ""}</h3><p>${esc(a.descripcion)}</p>
    <div class="meta"><span>${esc(cat.etiqueta)}</span><span>·</span><span>${fmtRelativa(a.fecha)}</span>${a.conjunto !== "todos" ? `<span>·</span><span>Solo ${esc(a.conjunto)}</span>` : ""}</div></div></article>`;
}

async function vistaAlertas() {
  await datosPromesa;
  const alertas = alertasVisibles();
  const vistoAntes = usuario.alertasVistasHasta || 0;
  const nuevasIds = new Set(alertas.filter((a) => a.fecha > vistoAntes).map((a) => a.id));
  if (nuevasIds.size) {
    const hasta = Date.now();
    usuario = { ...usuario, alertasVistasHasta: hasta };
    store.update("usuarios", usuario.id, { alertasVistasHasta: hasta }).catch(() => {});
  }
  const cats = Object.entries(CATEGORIAS);
  return {
    cuerpo: `${cabecera("Alertas y avisos", "Novedades de tu comunidad", { corta: true })}
    <main class="contenido normal">
      <div class="chips" role="tablist" aria-label="Filtrar por categoría">
        <button class="chip on" data-cat="todas">Todas</button>
        ${cats.map(([k, v]) => `<button class="chip" data-cat="${k}">${v.etiqueta}</button>`).join("")}
      </div>
      <section class="tarjeta" id="lista">${listaAlertasHtml(alertas, nuevasIds, "todas")}</section>
    </main>${navegacion("/alertas", itemsResidente(0))}`,
    montar() {
      $$(".chip").forEach((c) => c.addEventListener("click", () => {
        $$(".chip").forEach((x) => x.classList.toggle("on", x === c));
        $("#lista").innerHTML = listaAlertasHtml(alertas, nuevasIds, c.dataset.cat);
      }));
    },
  };
}
function listaAlertasHtml(alertas, nuevasIds, cat) {
  const l = cat === "todas" ? alertas : alertas.filter((a) => a.categoria === cat);
  return l.length ? l.map((a) => tarjetaAlerta(a, nuevasIds.has(a.id))).join("") : `<p class="vacio"><span class="mono">🐒</span>No hay alertas en esta categoría.</p>`;
}

async function vistaCupones() {
  await datosPromesa;
  const vig = datos.cupones.filter(cuponVigente);
  const tarjeta = (c) => `<article class="cupon">
    <h3>${esc(c.titulo)}</h3><div class="aliado">${esc(c.aliado || "")}</div><p>${esc(c.descripcion)}</p>
    <div class="pie"><span class="cod">${esc(c.codigo)}</span><button class="btn btn-chico" data-copiar="${esc(c.codigo)}">Copiar</button></div>
    ${c.vence ? `<div class="vence" style="margin-top:8px">Vence el ${fmtFecha(c.vence, true)}</div>` : ""}</article>`;
  return {
    cuerpo: `${cabecera("Tus cupones", "Beneficios para tu comunidad", { corta: true })}
    <main class="contenido normal">
      <h2 class="titulo-seccion">Cupones disponibles<small>Presenta el código en el comercio aliado.</small></h2>
      ${vig.length ? vig.map(tarjeta).join("") : `<p class="vacio"><span class="mono">🐒</span>Pronto habrá nuevos cupones.</p>`}
    </main>${navegacion("/cupones", itemsResidente(0))}`,
    montar() { enlazarCopiar(); },
  };
}

function vistaPerfil() {
  const u = usuario;
  const instalable = !esNativa() && !window.matchMedia("(display-mode: standalone)").matches;
  return {
    cuerpo: `${cabecera("Mi perfil", "", { corta: true })}
    <main class="contenido normal">
      <section class="tarjeta"><div class="usuario" style="padding-top:0"><div class="avatar">${esc(iniciales(u.nombre))}</div>
        <div class="dato"><b>${esc(u.nombre)}</b><span>${esc(formatoTelefono(u.telefono))}</span></div>
        ${esAdmin() ? '<span class="pildora admin">Admin</span>' : `<span class="pildora ${esc(u.estado)}">${u.estado === "activo" ? "Activo" : "Pendiente"}</span>`}</div>
        <p class="peque"><b>Conjunto:</b> ${esc(u.conjunto)}<br /><b>Torre:</b> ${esc(u.torre)} · <b>Apartamento:</b> ${esc(u.apartamento)}<br />
        <b>Registro:</b> ${fmtFecha(u.fechaRegistro, true)}</p></section>
      ${esAdmin() ? `<a class="btn btn-borde btn-bloque" style="margin-bottom:12px" href="#/inicio">Ver como residente</a>` : ""}
      ${ranuraPush()}
      <button class="btn btn-borde btn-bloque" id="clave" style="margin-bottom:12px">${ICONOS.llave} Cambiar mi clave</button>
      ${instalable ? `<section class="tarjeta"><h2>Instala Titi en tu celular</h2><p class="mut peque">En Android toca el menú ⋮ de Chrome y elige “Instalar aplicación”. En iPhone abre esta página en Safari, toca Compartir y elige “Agregar a pantalla de inicio”.</p></section>` : ""}
      <button class="btn btn-borde btn-bloque" id="salir">${ICONOS.salir} Cerrar sesión</button>
      <p class="peque mut" style="text-align:center;margin-top:14px">${store.modo === "demo" ? "Modo demostración" : "Conectado"} · Titi ${VERSION}</p>
    </main>${tieneAcceso() ? (esAdmin() ? navAdmin("/perfil") : navegacion("/perfil", itemsResidente(0))) : ""}`,
    montar() {
      montarPush();
      $("#clave").onclick = formClave;
      $("#salir").onclick = async () => { await cerrarSesion(); aviso("Sesión cerrada"); ir("/login"); };
    },
  };
}

function formClave() {
  hoja(`<h3 class="hoja-titulo">Cambiar mi clave</h3>
    <form id="f-k" novalidate>
      ${campoClave("actual", "Clave actual", "current-password")}
      ${campoClave("nueva", `Clave nueva (mínimo ${CLAVE_MIN} caracteres)`, "new-password")}
      ${campoClave("nueva2", "Repite la clave nueva", "new-password")}
      <p class="error-texto" id="err" role="alert"></p>
      <div class="fila-botones"><button type="button" class="btn btn-borde" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
    </form>`, (capa, cerrar) => {
    enlazarOjos(capa);
    $("#f-k", capa).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const err = $("#err", capa);
      const nueva = String(f.get("nueva"));
      if (nueva.length < CLAVE_MIN) return void (err.textContent = `La clave nueva debe tener al menos ${CLAVE_MIN} caracteres.`);
      if (nueva !== f.get("nueva2")) return void (err.textContent = "Las claves nuevas no coinciden.");
      e.submitter.disabled = true;
      try { await store.auth.cambiarClave(String(f.get("actual")), nueva); cerrar(); aviso("Clave actualizada"); }
      catch (er) { err.textContent = er.codigo === "credenciales" ? "La clave actual no es correcta." : mensajeError(er); e.submitter.disabled = false; }
    });
  });
}

function enlazarCopiar() {
  $$("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    aviso((await copiar(b.dataset.copiar)) ? "Código copiado" : "No se pudo copiar", "ok");
  }));
}

// ======================= Administración =======================
async function vistaAdminResumen() {
  await datosPromesa;
  const residentes = datos.usuarios.filter((u) => u.rol !== "admin");
  const act = residentes.filter((u) => u.estado === "activo").length;
  const pendientes = residentes.filter((u) => u.estado !== "activo").sort((a, b) => b.fechaRegistro - a.fechaRegistro);
  const total = CONFIG.totalHogares;
  const pct = ((act / total) * 100).toFixed(1).replace(".", ",");
  const porConj = CONJUNTOS.map((c) => ({ ...c, n: residentes.filter((u) => u.conjunto === c.nombre).length }));
  const max = Math.max(1, ...porConj.map((c) => c.n));
  return {
    cuerpo: `${cabecera("Panel de gestión", "Rol: Administrador", { accion: '<span class="pildora admin">ADMIN</span>' })}
    <main class="contenido solapado">
      <div class="kpis">
        <div class="kpi"><b>${residentes.length}</b><span>Registrados</span></div>
        <div class="kpi"><b>${act}</b><span>Aprobados</span></div>
        <div class="kpi ${pendientes.length ? "alerta-kpi" : ""}"><b>${pendientes.length}</b><span>Por aprobar</span></div>
      </div>
      ${pendientes.length ? `<section class="tarjeta"><div class="fila"><h2 style="margin:0">Pendientes de aprobación</h2><a class="peque" style="color:var(--green);font-weight:700" href="#/admin/usuarios">Ver todos</a></div>
        ${pendientes.slice(0, 5).map((u) => filaUsuario(u, `<button class="btn btn-chico btn-primario" style="width:auto" data-aprobar="${esc(u.id)}">Aprobar</button>`)).join("")}</section>` : ""}
      <section class="tarjeta"><h2>Alcance de la aplicación</h2>
        <div class="fila"><b style="font-size:26px">${pct}%</b><span class="mut peque">${act} de ${total.toLocaleString("es-CO")} hogares<br />de la caracterización</span></div>
        <div class="progreso"><i style="width:${Math.min(100, Math.max(2, (act / total) * 100))}%"></i></div>
        <p class="peque mut">${datos.alertas.length} alertas publicadas · ${datos.cupones.filter(cuponVigente).length} cupones vigentes</p></section>
      <section class="tarjeta"><h2>Registrados por conjunto</h2>
        ${porConj.map((c) => `<div class="barra-fila"><span>${esc(c.nombre)}</span><div class="barra"><i style="width:${(c.n / max) * 100}%"></i></div><small>${c.n}</small></div>`).join("")}</section>
    </main>${navAdmin("/admin")}`,
    montar() {
      $$("[data-aprobar]").forEach((b) => b.addEventListener("click", () => cambiarEstado(b.dataset.aprobar, "activo", b)));
    },
  };
}

async function cambiarEstado(id, estado, boton) {
  if (boton) boton.disabled = true;
  try {
    await store.update("usuarios", id, { estado });
    const u = datos.usuarios.find((x) => x.id === id);
    if (u) u.estado = estado;
    aviso(estado === "activo" ? "Usuario aprobado" : "Usuario en pendiente");
  } catch (er) { console.error(er); aviso("No se pudo actualizar", "error"); }
  enrutar(true);
}

function filaUsuario(u, acciones = "", pie = "") {
  return `<div class="usuario ${pie ? "con-acciones" : ""}"><div class="avatar">${esc(iniciales(u.nombre))}</div>
    <div class="dato"><b>${esc(u.nombre)}</b><span>${esc(u.conjunto)} · T${esc(u.torre)} · ${esc(u.apartamento)} · ${esc(formatoTelefono(u.telefono))}</span></div>
    ${acciones || `<span class="pildora ${esc(u.estado)}">${u.estado === "activo" ? "Aprobado" : "Pendiente"}</span>`}${pie ? `<div class="acciones">${pie}</div>` : ""}</div>`;
}

async function vistaAdminUsuarios() {
  await datosPromesa;
  const us = datos.usuarios.filter((u) => u.rol !== "admin").sort((a, b) => b.fechaRegistro - a.fechaRegistro);
  const filtro = filtroUsuarios;
  const filtrados = () => {
    const t = filtro.texto.toLowerCase();
    return us.filter((u) =>
      (!filtro.conjunto || u.conjunto === filtro.conjunto) && (!filtro.estado || (filtro.estado === "activo" ? u.estado === "activo" : u.estado !== "activo")) &&
      (!t || `${u.nombre} ${u.telefono} ${u.apartamento} ${u.torre}`.toLowerCase().includes(t)));
  };
  const dibujar = () => {
    const l = filtrados();
    $("#cuenta").textContent = `${l.length} ${l.length === 1 ? "usuario" : "usuarios"}`;
    $("#lista").innerHTML = l.length
      ? l.map((u) => filaUsuario(u, "", `<button class="btn btn-chico ${u.estado === "activo" ? "btn-borde" : "btn-primario"}" data-alternar="${esc(u.id)}">${u.estado === "activo" ? "Pasar a pendiente" : "Aprobar"}</button>
          <button class="btn btn-chico btn-borde" data-nueva-clave="${esc(u.id)}">${ICONOS.llave} Nueva clave</button>
          <button class="btn btn-chico btn-borde" style="color:var(--coral)" data-eliminar="${esc(u.id)}">${ICONOS.basura} Eliminar</button>`)).join("")
      : `<p class="vacio"><span class="mono">🐒</span>No hay usuarios con esos filtros.</p>`;
  };
  return {
    cuerpo: `${cabecera("Usuarios registrados", "Aprueba y gestiona a los residentes", { corta: true })}
    <main class="contenido normal">
      <div class="buscador">${ICONOS.buscar}<input class="entrada" id="q" type="search" placeholder="Buscar por nombre, celular o apartamento" aria-label="Buscar usuarios" value="${esc(filtro.texto)}" /></div>
      <div class="dos" style="margin-bottom:10px">
        <select class="entrada" id="fc" aria-label="Filtrar por conjunto"><option value="">Todos los conjuntos</option>${CONJUNTOS.map((c) => `<option ${filtro.conjunto === c.nombre ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select>
        <select class="entrada" id="fe" aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="activo" ${filtro.estado === "activo" ? "selected" : ""}>Aprobados</option><option value="pendiente" ${filtro.estado === "pendiente" ? "selected" : ""}>Por aprobar</option></select>
      </div>
      <div class="fila" style="margin-bottom:8px"><span class="mut peque" id="cuenta"></span>
        <button class="btn btn-chico btn-borde" id="csv">${ICONOS.descargar} Exportar CSV</button></div>
      <section class="tarjeta" id="lista"></section>
    </main>${navAdmin("/admin/usuarios")}`,
    montar() {
      dibujar();
      $("#q").addEventListener("input", (e) => { filtro.texto = e.target.value; dibujar(); });
      $("#fc").addEventListener("change", (e) => { filtro.conjunto = e.target.value; dibujar(); });
      $("#fe").addEventListener("change", (e) => { filtro.estado = e.target.value; dibujar(); });
      $("#lista").addEventListener("click", (e) => {
        const a = e.target.closest("[data-alternar]");
        if (a) {
          const u = us.find((x) => x.id === a.dataset.alternar);
          return void cambiarEstado(u.id, u.estado === "activo" ? "pendiente" : "activo", a);
        }
        const k = e.target.closest("[data-nueva-clave]");
        if (k) return void formNuevaClave(us.find((x) => x.id === k.dataset.nuevaClave));
        const d = e.target.closest("[data-eliminar]");
        if (d) eliminarUsuario(us.find((x) => x.id === d.dataset.eliminar), d);
      });
      $("#csv").addEventListener("click", () => {
        const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const filas = [["Nombre", "Conjunto", "Torre", "Apartamento", "Celular", "Estado", "Fecha de registro"],
          ...us.map((u) => [u.nombre, u.conjunto, u.torre, u.apartamento, u.telefono, u.estado === "activo" ? "aprobado" : "pendiente", new Date(u.fechaRegistro).toISOString().slice(0, 10)])];
        const blob = new Blob(["﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "usuarios-titi.csv"; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        aviso("Archivo CSV generado");
      });
    },
  };
}

async function eliminarUsuario(u, boton) {
  if (!u || u.rol === "admin" || u.id === usuario?.id) return;
  const ok = await confirmar(`¿Eliminar a ${u.nombre}? Perderá el acceso y no podrá ver la información. Esta acción no se puede deshacer.`, "Eliminar", true);
  if (!ok) return;
  boton.disabled = true;
  try {
    const r = await store.eliminarUsuario(u.id);
    datos.usuarios = datos.usuarios.filter((x) => x.id !== u.id);
    aviso(r.completo ? "Usuario eliminado" : "Usuario eliminado (publica las funciones para borrar también su acceso)");
    enrutar(true);
  } catch (er) {
    console.error(er); boton.disabled = false;
    aviso("No se pudo eliminar al usuario", "error");
  }
}

function formNuevaClave(u) {
  hoja(`<h3 class="hoja-titulo">Nueva clave para ${esc(u.nombre)}</h3>
    <p class="mut peque" style="margin-bottom:12px">Escribe una clave temporal y entrégasela a la persona. Ella podrá cambiarla desde su perfil.</p>
    <form id="f-nk" novalidate>
      <label class="campo"><span>Clave temporal (mínimo ${CLAVE_MIN} caracteres)</span><input class="entrada" name="clave" maxlength="64" autocomplete="off" required /></label>
      <p class="error-texto" id="err" role="alert"></p>
      <div class="fila-botones"><button type="button" class="btn btn-borde" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar clave</button></div>
    </form>`, (capa, cerrar) => {
    $("#f-nk", capa).addEventListener("submit", async (e) => {
      e.preventDefault();
      const clave = String(new FormData(e.target).get("clave") || "");
      if (clave.length < CLAVE_MIN) return void ($("#err", capa).textContent = `Mínimo ${CLAVE_MIN} caracteres.`);
      e.submitter.disabled = true;
      try { await store.restablecerClave(u.id, clave); cerrar(); aviso("Clave actualizada"); }
      catch (er) { console.error(er); $("#err", capa).textContent = "No se pudo cambiar la clave. Revisa que las funciones estén publicadas."; e.submitter.disabled = false; }
    });
  });
}

async function vistaAdminAlertas() {
  await datosPromesa;
  const l = [...datos.alertas].sort((a, b) => b.fecha - a.fecha);
  return {
    cuerpo: `${cabecera("Gestión de alertas", "Publica avisos para los residentes", { corta: true })}
    <main class="contenido normal"><section class="tarjeta">
      ${l.length ? l.map((a) => `<div class="item-admin"><span class="punto" style="background:${(CATEGORIAS[a.categoria] || CATEGORIAS.aviso).color};margin-top:7px"></span>
        <div class="dato"><b>${esc(a.titulo)}</b><span>${esc((CATEGORIAS[a.categoria] || CATEGORIAS.aviso).etiqueta)} · ${fmtFecha(a.fecha, true)} · ${a.conjunto === "todos" ? "Todos los conjuntos" : esc(a.conjunto)}</span></div>
        <button class="icon-btn" aria-label="Editar alerta" data-editar="${esc(a.id)}">${ICONOS.editar}</button>
        <button class="icon-btn rojo" aria-label="Eliminar alerta" data-borrar="${esc(a.id)}">${ICONOS.basura}</button></div>`).join("")
        : `<p class="vacio"><span class="mono">🐒</span>Aún no hay alertas. Toca + para crear la primera.</p>`}
    </section></main>
    <button class="flotante" id="nuevo" aria-label="Nueva alerta">${ICONOS.mas}</button>${navAdmin("/admin/alertas")}`,
    montar() {
      $("#nuevo").onclick = () => formAlerta();
      $$("[data-editar]").forEach((b) => b.onclick = () => formAlerta(l.find((a) => a.id === b.dataset.editar)));
      $$("[data-borrar]").forEach((b) => b.onclick = async () => {
        if (!(await confirmar("¿Eliminar esta alerta?", "Eliminar", true))) return;
        try { await store.remove("alertas", b.dataset.borrar); aviso("Alerta eliminada"); } catch { aviso("No se pudo eliminar", "error"); }
        enrutar(true);
      });
    },
  };
}

function formAlerta(a = null) {
  hoja(`<h3 class="hoja-titulo">${a ? "Editar alerta" : "Nueva alerta"}</h3>
    <form id="f-a" novalidate>
      <label class="campo"><span>Título</span><input class="entrada" name="titulo" maxlength="80" value="${esc(a?.titulo || "")}" required /></label>
      <label class="campo"><span>Mensaje</span><textarea class="entrada" name="descripcion" maxlength="400" required>${esc(a?.descripcion || "")}</textarea></label>
      <div class="dos">
        <label class="campo"><span>Categoría</span><select class="entrada" name="categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}" ${a?.categoria === k ? "selected" : ""}>${v.etiqueta}</option>`).join("")}</select></label>
        <label class="campo"><span>Dirigida a</span><select class="entrada" name="conjunto"><option value="todos">Todos</option>${CONJUNTOS.map((c) => `<option ${a?.conjunto === c.nombre ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></label>
      </div>
      ${a ? "" : `<p class="peque mut">🔔 Al publicar, los residentes aprobados reciben una notificación en su teléfono.</p>`}
      <p class="error-texto" id="err" role="alert"></p>
      <div class="fila-botones"><button type="button" class="btn btn-borde" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">${a ? "Guardar cambios" : "Publicar alerta"}</button></div>
    </form>`, (capa, cerrar) => {
    $("#f-a", capa).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.titulo = f.titulo.trim(); f.descripcion = f.descripcion.trim();
      if (!f.titulo || !f.descripcion) return void ($("#err", capa).textContent = "Escribe el título y el mensaje.");
      e.submitter.disabled = true;
      try {
        if (a) await store.update("alertas", a.id, f);
        else await store.add("alertas", { ...f, fecha: Date.now(), creadoPor: usuario.nombre });
        cerrar(); aviso(a ? "Alerta actualizada" : "Alerta publicada"); enrutar(true);
      } catch (er) { console.error(er); $("#err", capa).textContent = "No se pudo guardar. Intenta de nuevo."; e.submitter.disabled = false; }
    });
  });
}

async function vistaAdminCupones() {
  await datosPromesa;
  const l = [...datos.cupones].sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));
  return {
    cuerpo: `${cabecera("Gestión de cupones", "Beneficios para los residentes", { corta: true })}
    <main class="contenido normal"><section class="tarjeta">
      ${l.length ? l.map((c) => `<div class="item-admin"><div class="dato"><b>${esc(c.titulo)}</b>
        <span>${esc(c.aliado || "")} · ${esc(c.codigo)}${c.vence ? ` · vence ${fmtFecha(c.vence, true)}` : ""}</span><br />
        <span class="pildora ${cuponVigente(c) ? "activo" : "pendiente"}" style="margin-top:4px">${cuponVigente(c) ? "Vigente" : "No vigente"}</span></div>
        <button class="icon-btn" aria-label="Editar cupón" data-editar="${esc(c.id)}">${ICONOS.editar}</button>
        <button class="icon-btn rojo" aria-label="Eliminar cupón" data-borrar="${esc(c.id)}">${ICONOS.basura}</button></div>`).join("")
        : `<p class="vacio"><span class="mono">🐒</span>Aún no hay cupones. Toca + para crear el primero.</p>`}
    </section></main>
    <button class="flotante" id="nuevo" aria-label="Nuevo cupón">${ICONOS.mas}</button>${navAdmin("/admin/cupones")}`,
    montar() {
      $("#nuevo").onclick = () => formCupon();
      $$("[data-editar]").forEach((b) => b.onclick = () => formCupon(l.find((c) => c.id === b.dataset.editar)));
      $$("[data-borrar]").forEach((b) => b.onclick = async () => {
        if (!(await confirmar("¿Eliminar este cupón?", "Eliminar", true))) return;
        try { await store.remove("cupones", b.dataset.borrar); aviso("Cupón eliminado"); } catch { aviso("No se pudo eliminar", "error"); }
        enrutar(true);
      });
    },
  };
}

function formCupon(c = null) {
  const venceVal = c?.vence ? new Date(c.vence).toISOString().slice(0, 10) : "";
  hoja(`<h3 class="hoja-titulo">${c ? "Editar cupón" : "Nuevo cupón"}</h3>
    <form id="f-c" novalidate>
      <label class="campo"><span>Título</span><input class="entrada" name="titulo" maxlength="70" value="${esc(c?.titulo || "")}" required /></label>
      <label class="campo"><span>Comercio o aliado</span><input class="entrada" name="aliado" maxlength="60" value="${esc(c?.aliado || "")}" /></label>
      <label class="campo"><span>Descripción</span><textarea class="entrada" name="descripcion" maxlength="300" required>${esc(c?.descripcion || "")}</textarea></label>
      <div class="dos">
        <label class="campo"><span>Código</span><input class="entrada" name="codigo" maxlength="20" value="${esc(c?.codigo || "")}" autocapitalize="characters" required /></label>
        <label class="campo"><span>Vence (opcional)</span><input class="entrada" name="vence" type="date" value="${venceVal}" /></label>
      </div>
      <label class="chk" style="color:var(--ink)"><input type="checkbox" name="vigente" ${c?.vigente === false ? "" : "checked"} /><span>Cupón vigente (visible para los residentes)</span></label>
      ${c ? "" : `<p class="peque mut">🔔 Al crearlo vigente, los residentes aprobados reciben una notificación.</p>`}
      <p class="error-texto" id="err" role="alert"></p>
      <div class="fila-botones"><button type="button" class="btn btn-borde" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">${c ? "Guardar cambios" : "Crear cupón"}</button></div>
    </form>`, (capa, cerrar) => {
    $("#f-c", capa).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const d = {
        titulo: String(f.get("titulo")).trim(), aliado: String(f.get("aliado")).trim(), descripcion: String(f.get("descripcion")).trim(),
        codigo: normCodigo(f.get("codigo")), vigente: Boolean(f.get("vigente")),
        vence: f.get("vence") ? new Date(`${f.get("vence")}T23:59:59`).getTime() : null,
        fecha: c?.fecha || Date.now(),
      };
      if (!d.titulo || !d.descripcion || !d.codigo) return void ($("#err", capa).textContent = "Completa el título, la descripción y el código.");
      e.submitter.disabled = true;
      try {
        if (c) await store.update("cupones", c.id, d); else await store.add("cupones", d);
        cerrar(); aviso(c ? "Cupón actualizado" : "Cupón creado"); enrutar(true);
      } catch (er) { console.error(er); $("#err", capa).textContent = "No se pudo guardar. Intenta de nuevo."; e.submitter.disabled = false; }
    });
  });
}

arrancar();
