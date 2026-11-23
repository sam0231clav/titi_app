// ============================================================
//  CONFIGURACIÓN DE TITI
//  1) Pega aquí los datos de tu app web de Firebase
//     (Consola → ⚙️ Configuración del proyecto → Tus apps → Web → firebaseConfig).
//  2) Pega la clave VAPID (Consola → Configuración del proyecto → Cloud Messaging →
//     "Certificados push web" → Generar par de claves). Sirve para las notificaciones en el navegador.
//  Mientras apiKey esté vacío, la app funciona en MODO DEMOSTRACIÓN (datos de prueba en el dispositivo).
// ============================================================
export const CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "practicas-1d997.firebaseapp.com",
    projectId: "practicas-1d997",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },

  vapidKey: "",

  // Región donde están publicadas las Cloud Functions (debe coincidir con functions/index.js).
  regionFunciones: "us-central1",

  // Enlace de invitación a la comunidad oficial de WhatsApp de la Agrupación
  // (ejemplo: "https://chat.whatsapp.com/XXXXXXXXXXXX"). Si se deja vacío, el botón se oculta.
  whatsappComunidad: "",

  // Referencia para medir el alcance: hogares encuestados en la caracterización de Hacienda Rosablanca.
  totalHogares: 1079,
};

export const usaFirebase = Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
