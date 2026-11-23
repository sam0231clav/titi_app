// Utilidades de interfaz: escape de HTML, avisos, hojas modales e íconos.
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let temporizador;
export function aviso(texto, tipo = "ok") {
  const el = $("#aviso");
  el.textContent = texto;
  el.className = `aviso ${tipo} visible`;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => el.classList.remove("visible"), 3200);
}

// Hoja inferior (modal). Devuelve una función para cerrarla.
export function hoja(html, alMontar) {
  const capa = document.createElement("div");
  capa.className = "capa";
  capa.innerHTML = `<div class="hoja" role="dialog" aria-modal="true"><div class="asa"></div>${html}</div>`;
  const cerrar = () => capa.remove();
  capa.addEventListener("click", (e) => { if (e.target === capa) cerrar(); });
  capa.addEventListener("click", (e) => { if (e.target.closest("[data-cerrar]")) cerrar(); });
  document.body.appendChild(capa);
  alMontar?.(capa, cerrar);
  return cerrar;
}

export function confirmar(mensaje, textoOk = "Confirmar", peligro = false) {
  return new Promise((resolver) => {
    hoja(
      `<h3 class="hoja-titulo">${esc(mensaje)}</h3>
       <div class="fila-botones">
         <button class="btn btn-borde" data-no>Cancelar</button>
         <button class="btn ${peligro ? "btn-peligro" : "btn-primario"}" data-si>${esc(textoOk)}</button>
       </div>`,
      (capa, cerrar) => {
        capa.querySelector("[data-no]").onclick = () => { cerrar(); resolver(false); };
        capa.querySelector("[data-si]").onclick = () => { cerrar(); resolver(true); };
      }
    );
  });
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = texto;
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* sin permiso */ }
    t.remove();
    return ok;
  }
}

const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONOS = {
  inicio: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  alertas: svg('<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>'),
  cupones: svg('<path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  perfil: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  resumen: svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-8"/><path d="M22 20H2"/>'),
  usuarios: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M17 4.5a3.5 3.5 0 010 7"/><path d="M19 15c2 .7 3 2.2 3 5"/>'),
  candado: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  copiar: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'),
  whatsapp: svg('<path d="M3 21l1.6-4.8A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4-1z"/><path d="M9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .6c-.8-.4-1.6-1.2-2-2l.6-1-1-2z"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  editar: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  basura: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  descargar: svg('<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  salir: svg('<path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>'),
  buscar: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>'),
  ojo: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  llave: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
};
