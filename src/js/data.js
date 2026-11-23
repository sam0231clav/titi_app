// Datos fijos y utilidades puras de la aplicación.

// Los 12 conjuntos y los hogares encuestados en la caracterización de Hacienda Rosablanca.
export const CONJUNTOS = [
  { nombre: "Alborada", hogares: 98 },
  { nombre: "Alcaraván", hogares: 41 },
  { nombre: "Arauco", hogares: 104 },
  { nombre: "Canaguay", hogares: 42 },
  { nombre: "Cimarrón", hogares: 81 },
  { nombre: "Mapire", hogares: 136 },
  { nombre: "Morichal", hogares: 80 },
  { nombre: "Ocarro I", hogares: 75 },
  { nombre: "Paso Llano", hogares: 125 },
  { nombre: "Paso Llano 2", hogares: 58 },
  { nombre: "Piedemonte", hogares: 118 },
  { nombre: "Zainos", hogares: 121 },
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
