// Datos fijos y utilidades puras de la aplicación.

// Los 18 conjuntos de Hacienda Rosablanca y su número de apartamentos.
export const CONJUNTOS = [
  { nombre: "Alborada", apartamentos: 440 },
  { nombre: "Alcaraván", apartamentos: 396 },
  { nombre: "Arauco", apartamentos: 570 },
  { nombre: "Canaguay", apartamentos: 372 },
  { nombre: "Centro comercial", apartamentos: 74 },
  { nombre: "Cimarrón", apartamentos: 440 },
  { nombre: "Mapire", apartamentos: 560 },
  { nombre: "Morichal", apartamentos: 400 },
  { nombre: "Ocarro", apartamentos: 492 },
  { nombre: "Pasollano 1", apartamentos: 600 },
  { nombre: "Pasollano 2", apartamentos: 680 },
  { nombre: "Pasollano 3", apartamentos: 680 },
  { nombre: "Pasollano 4", apartamentos: 480 },
  { nombre: "Pasollano 5", apartamentos: 440 },
  { nombre: "Piedemonte", apartamentos: 560 },
  { nombre: "Prado Verde", apartamentos: 540 },
  { nombre: "Tuparro", apartamentos: 360 },
  { nombre: "Zainos", apartamentos: 600 },
];

export const CATEGORIAS = {
  importante: { etiqueta: "Importante", color: "var(--coral)" },
  evento: { etiqueta: "Evento", color: "var(--sun)" },
  beneficio: { etiqueta: "Beneficio", color: "var(--green)" },
  aviso: { etiqueta: "Aviso", color: "var(--sky)" },
};

export const CLAVE_MIN = 6;

export const normTelefono = (v) => String(v || "").replace(/\D/g, "");
// Celular colombiano: 10 dígitos que empiezan por 3.
export const telefonoValido = (v) => /^3\d{9}$/.test(normTelefono(v));
// Firebase Auth identifica por correo: se usa uno interno derivado del celular (el usuario nunca lo ve).
export const emailDe = (tel) => `${normTelefono(tel)}@usuarios.titi.app`;

export function formatoTelefono(v) {
  const t = normTelefono(v);
  return t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t;
}

export const normCodigo = (v) => String(v || "").trim().toUpperCase().replace(/\s+/g, "");

export const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "";

export function fmtFecha(ms, conAnio = false) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    ...(conAnio ? { year: "numeric" } : {}),
  }).replace(".", "");
}

export function fmtRelativa(ms) {
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return fmtFecha(ms);
}

export const iniciales = (n) =>
  String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
