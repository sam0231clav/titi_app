// Capa de datos y de acceso. Dos implementaciones con la misma interfaz:
//  - FirebaseStore: Firebase Auth + Firestore (producción)
//  - LocalStore: localStorage (modo demostración, sin conexión)
// Colecciones: usuarios (id = uid de Firebase Auth), alertas, cupones.
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider,
  reauthenticateWithCredential, deleteUser,
} from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc,
  getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, limit, onSnapshot, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CONFIG, usaFirebase } from "./config.js";
import { emailDe, normTelefono } from "./data.js";

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fallo = (codigo, mensaje = codigo) => Object.assign(new Error(mensaje), { codigo });

// ---------- almacenamiento del navegador (con respaldo en memoria) ----------
const memoria = new Map();
export const lsGet = (k) => {
  try { return localStorage.getItem(k); } catch { return memoria.get(k) ?? null; }
};
export const lsSet = (k, v) => {
  try { localStorage.setItem(k, v); } catch { memoria.set(k, v); }
};
export const lsDel = (k) => {
  try { localStorage.removeItem(k); } catch { memoria.delete(k); }
};
// La sesión del modo demostración vive solo en la pestaña (así se pueden probar dos personas a la vez).
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return memoria.get("ss" + k) ?? null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { memoria.set("ss" + k, v); } };
const ssDel = (k) => { try { sessionStorage.removeItem(k); } catch { memoria.delete("ss" + k); } };

// ============================ MODO DEMOSTRACIÓN ============================
function datosDemo() {
  const dia = 86400000;
  const ahora = Date.now();
  const claves = {};
  const u = (nombre, conjunto, torre, apto, tel, estado, dias, clave, extra = {}) => {
    const id = nuevoId();
    claves[id] = clave;
    return {
      id, nombre, conjunto, torre, apartamento: apto, telefono: tel, rol: "usuario", estado,
      fechaRegistro: ahora - dias * dia, alertasVistasHasta: ahora - dias * dia, tokens: [], ...extra,
    };
  };
  const usuarios = [
    u("Administración Rosablanca", "Piedemonte", "-", "-", "3000000000", "activo", 60, "Admin2026", { rol: "admin" }),
    u("Laura Gómez", "Mapire", "3", "502", "3101234567", "activo", 20, "laura123"),
    u("Julián Pérez", "Morichal", "1", "101", "3112223344", "activo", 18, "demo1234"),
    u("María Ruiz", "Piedemonte", "5", "302", "3125556677", "pendiente", 2, "demo1234"),
    u("Carlos Díaz", "Zainos", "2", "204", "3138889900", "activo", 12, "demo1234"),
    u("Ana Torres", "Arauco", "4", "401", "3141112233", "pendiente", 1, "demo1234"),
    u("Pedro Rojas", "Mapire", "1", "105", "3154445566", "activo", 9, "demo1234"),
    u("Sofía Castro", "Paso Llano", "2", "303", "3167778899", "activo", 6, "demo1234"),
  ];
  const alertas = [
    { id: nuevoId(), titulo: "Corte de agua programado", descripcion: "Mañana de 8:00 a.m. a 12:00 m. habrá suspensión del servicio en todos los conjuntos por mantenimiento de la red.", categoria: "importante", conjunto: "todos", fecha: ahora - 0.2 * dia, creadoPor: "Administración" },
    { id: nuevoId(), titulo: "Feria de emprendimientos", descripcion: "Este sábado de 9:00 a.m. a 2:00 p.m. en la zona comunal. Ven a apoyar los negocios de tus vecinos.", categoria: "evento", conjunto: "todos", fecha: ahora - 1.5 * dia, creadoPor: "Administración" },
    { id: nuevoId(), titulo: "Nuevo convenio con farmacia", descripcion: "Con tu cuenta activa obtienes un 15% de descuento. Revisa la sección Cupones.", categoria: "beneficio", conjunto: "todos", fecha: ahora - 3 * dia, creadoPor: "Administración" },
    { id: nuevoId(), titulo: "Jornada de reciclaje en Mapire", descripcion: "Este viernes en el parqueadero de visitantes del conjunto Mapire, de 3:00 a 6:00 p.m.", categoria: "aviso", conjunto: "Mapire", fecha: ahora - 5 * dia, creadoPor: "Administración" },
  ];
  const cupones = [
    { id: nuevoId(), titulo: "15% en Farmacia San José", descripcion: "Descuento en medicamentos y productos de cuidado personal. Presenta tu código en caja.", aliado: "Farmacia San José", codigo: "TITI-FARM15", vigente: true, vence: ahora + 40 * dia },
    { id: nuevoId(), titulo: "2x1 en lavado de vehículo", descripcion: "Válido de lunes a viernes presentando el código.", aliado: "Autolavado El Rosal", codigo: "TITI-LAVA2X1", vigente: true, vence: ahora + 25 * dia },
    { id: nuevoId(), titulo: "Postre gratis con tu almuerzo", descripcion: "Un postre del día de cortesía al pedir un almuerzo ejecutivo.", aliado: "Restaurante Sabor Llanero", codigo: "TITI-POSTRE", vigente: true, vence: null },
  ];
  return { usuarios, alertas, cupones, claves };
}

class LocalStore {
  constructor() {
    this.modo = "demo";
    this.llave = "titi_demo_db_v2";
    this.sesion = "titi_demo_sesion";
    const g = lsGet(this.llave);
    try { this.db = g ? JSON.parse(g) : null; } catch { this.db = null; }
    if (!this.db) { this.db = datosDemo(); this.guardar(); }
    this.oyentes = new Set();
    // Cambios hechos desde otra pestaña (útil para probar el aviso en vivo sin Firebase).
    try {
      window.addEventListener("storage", (e) => {
        if (e.key !== this.llave || !e.newValue) return;
        try { this.db = JSON.parse(e.newValue); } catch { return; }
        ["usuarios", "alertas", "cupones"].forEach((c) => this.emitir(c, true));
      });
    } catch { /* sin ventana */ }
    this.auth = {
      esperar: async () => {
        const id = ssGet(this.sesion);
        return id && this.db.usuarios.some((x) => x.id === id) ? id : null;
      },
      uid: () => ssGet(this.sesion),
      ingresar: async (tel, clave) => {
        const t = normTelefono(tel);
        const x = this.db.usuarios.find((y) => y.telefono === t);
        if (!x || this.db.claves[x.id] !== clave) throw fallo("credenciales");
        ssSet(this.sesion, x.id);
        return x.id;
      },
      registrar: async (tel, clave, perfil) => {
        const t = normTelefono(tel);
        if (this.db.usuarios.some((y) => y.telefono === t)) throw fallo("ya-existe");
        const id = nuevoId();
        this.db.usuarios.push({ ...perfil, id });
        this.db.claves[id] = clave;
        this.guardar();
        this.emitir("usuarios");
        ssSet(this.sesion, id);
        return id;
      },
      salir: async () => ssDel(this.sesion),
      cambiarClave: async (actual, nueva) => {
        const id = ssGet(this.sesion);
        if (this.db.claves[id] !== actual) throw fallo("credenciales");
        this.db.claves[id] = nueva;
        this.guardar();
      },
    };
  }
  guardar() { lsSet(this.llave, JSON.stringify(this.db)); }
  emitir(col, externo = false) { [...this.oyentes].forEach((o) => o.col === col && o.fn(externo)); }
  _lista(col, filtro) {
    let l = structuredClone(this.db[col] || []);
    if (filtro?.conjuntos) l = l.filter((a) => filtro.conjuntos.includes(a.conjunto));
    return l;
  }
  async list(col, filtro) { return this._lista(col, filtro); }
  async get(col, id) { return structuredClone((this.db[col] || []).find((x) => x.id === id) || null); }
  observar(col, filtro, cb) {
    let primera = true;
    const o = { col, fn: (externo = false) => { cb(this._lista(col, filtro), { local: !externo && !primera }); primera = false; } };
    this.oyentes.add(o);
    queueMicrotask(() => this.oyentes.has(o) && o.fn());
    return () => this.oyentes.delete(o);
  }
  observarDoc(col, id, cb) {
    const o = { col, fn: () => cb(structuredClone((this.db[col] || []).find((x) => x.id === id) || null)) };
    this.oyentes.add(o);
    queueMicrotask(() => this.oyentes.has(o) && o.fn());
    return () => this.oyentes.delete(o);
  }
  async add(col, obj) {
    const fila = { ...obj, id: nuevoId() };
    (this.db[col] ||= []).push(fila);
    this.guardar(); this.emitir(col);
    return structuredClone(fila);
  }
  async update(col, id, cambios) {
    const fila = (this.db[col] || []).find((x) => x.id === id);
    if (!fila) throw new Error("Registro no encontrado.");
    Object.assign(fila, cambios);
    this.guardar(); this.emitir(col);
  }
  async remove(col, id) {
    this.db[col] = (this.db[col] || []).filter((x) => x.id !== id);
    this.guardar(); this.emitir(col);
  }
  async guardarToken() {}
  async quitarToken() {}
  async restablecerClave(uid, clave) { this.db.claves[uid] = clave; this.guardar(); }
  reiniciar() { this.db = datosDemo(); this.guardar(); ssDel(this.sesion); }
}

// ============================ FIREBASE ============================
const traducirAuth = (e) => {
  const c = e?.code || "";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-login-credentials"].includes(c)) return fallo("credenciales");
  if (c === "auth/email-already-in-use") return fallo("ya-existe");
  if (c === "auth/weak-password") return fallo("clave-debil");
  if (c === "auth/too-many-requests") return fallo("demasiados");
  if (c === "auth/network-request-failed") return fallo("red");
  if (c === "auth/operation-not-allowed" || c === "auth/configuration-not-found") return fallo("config");
  return e;
};

class FirebaseStore {
  async init() {
    this.modo = "firebase";
    this.app = initializeApp(CONFIG.firebase);
    const a = initializeAuth(this.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    try {
      this.db = initializeFirestore(this.app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      this.db = getFirestore(this.app);
    }
    const perfilRef = (uid) => doc(this.db, "usuarios", uid);
    this.auth = {
      esperar: () => new Promise((res) => { const off = onAuthStateChanged(a, (u) => { off(); res(u?.uid || null); }); }),
      uid: () => a.currentUser?.uid || null,
      ingresar: async (tel, clave) => {
        try { return (await signInWithEmailAndPassword(a, emailDe(tel), clave)).user.uid; } catch (e) { throw traducirAuth(e); }
      },
      registrar: async (tel, clave, perfil) => {
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(a, emailDe(tel), clave);
        } catch (e) {
          if (e?.code !== "auth/email-already-in-use") throw traducirAuth(e);
          // Puede ser un registro que quedó a medias (cuenta sin perfil): si la clave coincide, se completa.
          try { cred = await signInWithEmailAndPassword(a, emailDe(tel), clave); } catch { throw fallo("ya-existe"); }
          const ya = await getDoc(perfilRef(cred.user.uid)).catch(() => null);
          if (ya?.exists()) { await signOut(a); throw fallo("ya-existe"); }
        }
        try {
          await setDoc(perfilRef(cred.user.uid), perfil);
        } catch (e) {
          await deleteUser(cred.user).catch(() => {});
          throw e;
        }
        return cred.user.uid;
      },
      salir: () => signOut(a),
      cambiarClave: async (actual, nueva) => {
        const u = a.currentUser;
        try {
          await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, actual));
          await updatePassword(u, nueva);
        } catch (e) { throw traducirAuth(e); }
      },
    };
    return this;
  }
  _q(col) {
    const c = collection(this.db, col);
    if (col === "alertas") return query(c, orderBy("fecha", "desc"), limit(100));
    if (col === "cupones") return query(c, limit(100));
    return c;
  }
  async list(col) {
    return (await getDocs(this._q(col))).docs.map((d) => ({ ...d.data(), id: d.id }));
  }
  async get(col, id) {
    const s = await getDoc(doc(this.db, col, id));
    return s.exists() ? { ...s.data(), id: s.id } : null;
  }
  observar(col, filtro, cb) {
    return onSnapshot(
      this._q(col),
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })), { local: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache }),
      (error) => { console.warn(`[${col}]`, error.code); cb(null, { error }); }
    );
  }
  observarDoc(col, id, cb) {
    return onSnapshot(
      doc(this.db, col, id),
      (s) => cb(s.exists() ? { ...s.data(), id: s.id } : null),
      (error) => { console.warn(`[${col}/${id}]`, error.code); }
    );
  }
  async add(col, obj) {
    const ref = await addDoc(collection(this.db, col), obj);
    return { ...obj, id: ref.id };
  }
  async update(col, id, cambios) { await updateDoc(doc(this.db, col, id), cambios); }
  async remove(col, id) { await deleteDoc(doc(this.db, col, id)); }
  guardarToken(uid, token) { return updateDoc(doc(this.db, "usuarios", uid), { tokens: arrayUnion(token) }); }
  quitarToken(uid, token) { return updateDoc(doc(this.db, "usuarios", uid), { tokens: arrayRemove(token) }); }
  async restablecerClave(uid, clave) {
    const f = httpsCallable(getFunctions(this.app, CONFIG.regionFunciones), "restablecerClave");
    await f({ uid, clave });
  }
}

export async function crearStore() {
  return usaFirebase ? new FirebaseStore().init() : new LocalStore();
}
