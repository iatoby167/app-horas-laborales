# Hub de Ingresos

Panel personal y local para visualizar ingresos recurrentes, desarrollos puntuales, servicios por hora, pagos fijos y el estado de cobro de cada uno.

La app funciona como PWA: se puede instalar en el celular y queda disponible sin conexión después de la primera carga.

## Qué incluye

- **Hub principal:** MRR, desarrollos del mes, total estimado, cobrado vs. pendiente y proyectos activos.
- **Sidebar adaptable:** menú emergente con sección activa, opción de fijarlo en escritorio y modo compacto de íconos.
- **Micro-SaaS y suscripciones:** aparecen desde el mes seleccionado al crearlas. Activar, pausar o registrar un cobro afecta solo a ese mes; los siguientes empiezan activos y pendientes. Nombre, monto y demás datos generales siguen compartidos entre meses.
- **Desarrollos puntuales:** presupuesto, fecha estimada, estado del proyecto y cobro parcial o total.
- **Tracker de horas integrado:** conserva el calendario de horas y suma automáticamente su total al Hub.
- **Ingresos fijos o extras:** cargos recurrentes o pagos únicos.
- **Montos en ARS o USD:** cada fuente y la tarifa del tracker puede cargarse en su moneda original; el Hub consolida en pesos argentinos con la última cotización USD publicada por el BCRA.
- **Histórico mensual:** elegí el período con las flechas o el selector de mes.
- **Backup:** descarga e importa los datos completos del Hub y del tracker.

## Tus datos

Tus datos financieros se guardan localmente en el dispositivo y no se envían a ningún servidor. Se consulta la cotización pública del BCRA y, cuando buscás actualizaciones en Windows, las versiones publicadas en GitHub; estas consultas no transmiten tus ingresos, proyectos ni horas. Los registros de horas de la versión anterior se conservan automáticamente al abrir esta versión.

Para convertir USD, la app consulta la API pública de Estadísticas Cambiarias del BCRA y conserva la última cotización disponible para seguir mostrando conversiones sin conexión. La interfaz siempre muestra la fecha de publicación y actualización de la referencia usada.

Hacé una copia de seguridad antes de borrar los datos del navegador o cambiar de teléfono. Los backups nuevos incluyen fuentes de ingreso y estados de cobro, y la importación sigue aceptando backups anteriores del contador de horas.

Las suscripciones anteriores toman como inicio el mes de creación o el primer mes con registros, si es anterior. Sus pagos mensuales se conservan; los estados globales antiguos de actividad y cobro se asignan al mes de inicio, ya que no tienen un mes de origen registrado.

## Estructura

- `index.html`: interfaz, estilos y estructura accesible.
- `app.js`: navegación, estado del drawer, componentes visuales, formularios y eventos.
- `data.js`: modelo financiero, cálculos, validación, almacenamiento local y preferencias visuales.
- `sw.js`: caché para instalación y funcionamiento sin conexión.
- `manifest.webmanifest` e íconos: datos de la PWA instalada.

## Probar localmente

En Windows, desde esta carpeta:

    python -m http.server 8000

Abrí `http://localhost:8000`. En otros sistemas, puede ser necesario usar `python3` en lugar de `python`.

## Crear la aplicación descargable para Windows

Requiere tener instalado Node.js 20 o superior. Desde esta carpeta ejecutá:

    npm install
    npm run dist

El instalador aparecerá en `dist/Hub-de-Ingresos-1.0.2-instalador-x64.exe`, junto con `latest.yml` y su `.blockmap`. Para generar además la versión portable, ejecutá `npm run dist:portable`. Los comandos locales generan archivos sin publicarlos.

Para probar la versión de escritorio sin crear el instalador:

    npm start

## Publicarla con GitHub Pages

1. Creá un repositorio público en GitHub.
2. Subí todos los archivos de esta carpeta sin cambiar sus nombres.
3. En **Settings → Pages**, elegí **Deploy from a branch**, rama `main` y carpeta `/(root)`.
4. Abrí la dirección HTTPS que te entregue GitHub e instalá la app desde el navegador.

## Publicarla con Vercel

1. Subí la carpeta a un repositorio de GitHub.
2. En Vercel elegí **Add New → Project** e importá el repositorio.
3. Seleccioná el preset **Other**, sin comando de build ni directorio de salida.
4. Cada commit en `main` se desplegará automáticamente en producción.

## Actualizar la app

### Windows

La versión instalada incluye **Actualizar programa** en la barra superior y una tarjeta en Configuración. El flujo es **Buscar actualizaciones → Descargar actualización → Instalar y reiniciar**. Muestra el progreso y conserva los registros guardados. La descarga y la instalación solo comienzan cuando las pedís; cerrar el programa no instala una descarga pendiente automáticamente.

El origen configurado es [GitHub Releases de iatoby167/app-horas-laborales](https://github.com/iatoby167/app-horas-laborales/releases). El repositorio debe ser público. Cada Release estable debe contener el instalador NSIS, su `.blockmap` y `latest.yml`; subir solo el código o el ejecutable no alcanza. La portable no admite este mecanismo: usá el instalador para recibir actualizaciones dentro de la app.

Las versiones anteriores a 1.0.2 necesitan instalar 1.0.2 manualmente una vez para incorporar el botón. La app no cambia su identificador ni el directorio de datos al actualizar.

### Cambios de prueba por defecto

Cada cambio pedido se prueba y se sube a la rama `pruebas`. El workflow `windows-prueba.yml` genera automáticamente una **Pre-release**, nunca una versión estable ni Latest. La política para futuros trabajos está guardada en `AGENTS.md`.

La versión de prueba se instala como **Hub de Ingresos Prueba**, con un acceso directo y un perfil independientes. La ventana identifica que es de prueba y su actualizador solo busca el canal `prueba`. La app normal mantiene sus datos y solo recibe versiones estables. Este aislamiento también permite abrir ambas aplicaciones.

**Volver a la normal:** cerrá Hub de Ingresos Prueba y abrí Hub de Ingresos. No hace falta desinstalar ni bajar de versión. Para ensayar con tus registros, exportá un backup desde la normal e importalo en la prueba. Los datos que cargues en la prueba no pasan automáticamente a la normal.

La Pre-release contiene el instalador de prueba, su `.blockmap` y `prueba.yml`. El número se genera como `1.0.3-prueba.<ejecución>.<intento>` a partir de la versión base; una corrección produce una publicación nueva y conserva las anteriores. `npm run dist:prueba` genera una compilación local `prueba.0.1` en `dist-prueba` sin publicar.

### Promover a estable (solo por pedido explícito)

1. Revisar la versión de prueba y autorizar expresamente su promoción.
2. Integrar los cambios aprobados en `main` e incrementar la versión estable de `package.json` y `package-lock.json`.
3. Ejecutar manualmente **Publicar versión ESTABLE de Windows (manual)** desde `main`, confirmando exactamente la versión.
4. Ese workflow genera y publica el instalador normal, su `.blockmap` y `latest.yml`. La publicación estable no se dispara con un push ni con un tag.

Los workflows usan el token de GitHub Actions; no incluyas tokens en los archivos de la app. No sobrescribas versiones ya publicadas.

Pruebas: `npm test`, `npm run test:updates-ui` y `npm run test:ui`. La prueba de interfaz del actualizador usa una sesión temporal y simula la descarga/instalación: no reemplaza la aplicación instalada.

### Web / PWA

Cuando cambies `index.html`, `app.js`, `data.js`, íconos o el manifiesto, subí el número de `VERSION` en `sw.js`. Eso permite que los dispositivos reciban la nueva caché.

## Feriados

La app incluye feriados nacionales de Argentina para 2026, sin puentes turísticos. Para otros años, cargalos desde el modo **Feriado** del tracker y verificá las fechas antes de liquidar.
