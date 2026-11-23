# Titi — Agrupación Social Hacienda Rosablanca

App móvil (Android) y web para que los residentes de los 12 conjuntos reciban **alertas y cupones** al instante.
Una sola base de código: la misma app funciona como **página web instalable** (Firebase Hosting) y como **APK de Android**.

## Qué hace
- **Ingreso con celular y clave** (Firebase Authentication). El administrador también entra con clave.
- **Aprobación del administrador:** quien se registra queda en una pantalla de *"Espera a que un administrador te apruebe para que puedas ver la información"*. No ve alertas ni cupones hasta que lo aprueben — y esto lo **exigen las reglas de Firestore**, no solo la pantalla.
- **Notificaciones push reales** al teléfono (con la app cerrada) cuando el administrador publica una alerta o un cupón, cuando alguien se registra (aviso a los administradores) y cuando aprueban a un residente.
- Alertas por categoría y por conjunto, cupones, panel de administración (aprobar usuarios, asignar clave temporal, exportar CSV, gestionar alertas y cupones).
- Rápida: todo el código va en un solo paquete comprimido, se abre desde caché (también sin internet) y los datos se actualizan en vivo.
- Ya **no hay código de vecino** ni referidos.

---

## Parte 1 — Configurar Firebase (una sola vez, ~20 minutos)

Proyecto actual: `practicas-1d997` (ya está en `.firebaserc`).

1. **Authentication** → *Comenzar* → pestaña **Sign-in method** → activa **Correo electrónico/contraseña** → Guardar.
   (La app usa un correo interno `3101234567@usuarios.titi.app` solo para identificar el celular; la persona nunca lo ve.)
2. **Plan Blaze** (necesario para las notificaciones): engranaje ⚙️ → *Uso y facturación* → *Detalles y configuración* → **Modificar plan** → Blaze.
   Pide una tarjeta, pero el uso gratuito mensual de Firebase cubre de sobra a la agrupación (1.079 hogares). Crea una **alerta de presupuesto** de, por ejemplo, 5 USD para estar tranquilo.
   > Sin Blaze no se pueden desplegar las funciones, y sin ellas no hay notificaciones con la app cerrada.
3. **Cloud Messaging → clave VAPID** (para avisos en el navegador): ⚙️ → *Configuración del proyecto* → pestaña **Cloud Messaging** → *Certificados push web* → **Generar par de claves**. Copia la clave.
4. **Datos de la app web:** ⚙️ → *Configuración del proyecto* → *Tus apps* → app **Web** (`</>`) → copia el bloque `firebaseConfig`.
   Pega los valores y la clave VAPID en **`src/js/config.js`** (`apiKey`, `messagingSenderId`, `appId`, `vapidKey`).
   Si ya habías pegado el `firebaseConfig` en la versión anterior, usa los mismos valores.
5. **Región de las funciones:** en Firestore mira la ubicación de tu base de datos (Firestore → Datos → arriba).
   Si es `nam5` o `us-central`, no cambies nada. Si es otra (por ejemplo `southamerica-east1`), cambia `REGION` en `functions/index.js` y `regionFunciones` en `src/js/config.js`.
6. **App de Android (para el APK):** ⚙️ → *Tus apps* → **Agregar app → Android**.
   Nombre del paquete: **`co.rosablanca.titi`** → Registrar → **descarga `google-services.json`** y guárdalo en **`android/app/google-services.json`**. (Los demás pasos del asistente se pueden saltar.)

## Parte 2 — Publicar (web + reglas + funciones)

En la terminal, dentro de la carpeta `titi`:

```
npm install
firebase login
npm run deploy
```
- `npm install` también instala las funciones.
- La primera vez, Firebase te pedirá activar algunas APIs (Cloud Functions, Cloud Build, Artifact Registry): responde **Y** a todo.
- Al terminar te da el enlace de la web: `https://practicas-1d997.web.app`
- Para publicar solo la web: `npm run deploy:web`. Solo reglas: `npm run deploy:reglas`. Solo funciones: `npm run deploy:funciones`.

## Parte 3 — Crear el primer administrador (una vez)

1. Abre la web (o el APK) y **regístrate** con el celular de quien administrará.
2. Firebase → **Firestore Database** → colección **`usuarios`** → busca el documento con ese `telefono`.
3. Cambia **`rol`** a `admin` y **`estado`** a `activo` → Guardar.
4. Cierra sesión y vuelve a entrar: aparece el **Panel de gestión**.
   Desde ahí apruebas a los demás. (Nadie puede darse el rol de administrador desde la app: las reglas lo impiden.)

**¿Alguien olvidó su clave?** Administración → Usuarios → **Nueva clave**: escribes una clave temporal, se la das a la persona y ella la cambia en *Perfil → Cambiar mi clave*.

## Parte 4 — Obtener el APK

> Aquí se compila automáticamente en GitHub (no necesitas instalar Android Studio).

1. Crea una cuenta en https://github.com y un repositorio nuevo (por ejemplo `titi-app`, puede ser privado).
2. En la terminal, dentro de la carpeta `titi` (si no tienes Git: `winget install Git.Git` y reabre la terminal):
   ```
   git init
   git add .
   git commit -m "Titi"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/titi-app.git
   git push -u origin main
   ```
   (Asegúrate de que `android/app/google-services.json` ya esté en la carpeta antes de hacer `git add .`.)
3. En GitHub → pestaña **Actions** → **Construir APK de Titi** (empieza solo; si no, *Run workflow*). Tarda ~5–8 minutos.
4. Entra a la ejecución terminada → abajo, **Artifacts → Titi-APK** → descarga el `.zip` → dentro está `app-debug.apk`.
5. Pásalo al celular (WhatsApp, Drive, cable…) y ábrelo. Android te pedirá permitir **"instalar apps de fuentes desconocidas"** para esa app; acéptalo. Si Play Protect avisa, elige *Instalar de todos modos* (es normal con APK propios).
6. Al abrir Titi por primera vez, acepta el permiso de **notificaciones**.

Si prefieres compilar en tu computador: instala Android Studio, ejecuta `npm run apk`, abre la carpeta `android` con Android Studio y usa *Build → Build APK(s)*.

Notas del APK:
- Es un APK de **depuración** (sirve para instalar y usar en cualquier Android). Cada compilación nueva se firma con una llave distinta: para actualizar, desinstala la versión anterior primero. Para publicar en Play Store hace falta un APK/AAB firmado con una llave propia (se puede agregar después).
- Cada vez que cambies algo de la app, vuelve a subir a GitHub (`git add . && git commit -m "cambios" && git push`) y se genera un APK nuevo.

## Probar las notificaciones
1. En el celular: abre Titi con una cuenta **aprobada** (acepta el permiso de notificaciones).
2. **Cierra la app por completo.**
3. En otro dispositivo/navegador entra como administrador → *Alertas* → **+** → publica una alerta.
4. En unos segundos debe sonar la notificación en el teléfono. Al tocarla, abre Titi en *Alertas*.

En la web (Chrome Android o computador) el permiso se pide con el botón **"Activar notificaciones"** que aparece en Inicio / Perfil. En iPhone solo funciona si instalas la web en la pantalla de inicio (iOS 16.4+).

Si no llega: Firebase → **Functions → Registros** muestra qué pasó ("N enviadas de M"). Causas típicas: el teléfono no aceptó el permiso, falta `google-services.json` en el APK, o `vapidKey` vacía en la web.

## Seguridad (lo que quedó resuelto)
- Para leer algo hay que iniciar sesión; una cuenta pendiente solo ve su propio perfil.
- Solo administradores aprueban usuarios y gestionan alertas y cupones; el rol de administrador solo se asigna a mano en la consola.
- Cada persona solo puede modificar sus propios tokens de notificación y la marca de "alertas vistas".
- El texto de las alertas se escapa (no se puede inyectar código).
- Las claves las guarda Firebase Authentication (cifradas); la app nunca las almacena.

## Probar sin Firebase (modo demostración)
Con `apiKey` vacía en `config.js` la app funciona con datos de prueba en el dispositivo:
`npm run dev` → http://localhost:5173 — Administrador `300 000 0000` / `Admin2026` · Residente `310 123 4567` / `laura123`.
(En ese modo no hay notificaciones push reales.)

## Estructura
```
src/            código de la app (js/, css/, assets/, index.html, sw.js, manifest)
functions/      Cloud Functions: notificaciones push y clave temporal
android/        proyecto Android (Capacitor) listo para compilar
scripts/        compilación (esbuild)
firestore.rules reglas de seguridad      firebase.json / .firebaserc  configuración de Firebase
.github/workflows/apk.yml  receta que construye el APK en GitHub
```
