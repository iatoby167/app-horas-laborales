# Hub de Ingresos

Panel personal y local para visualizar ingresos recurrentes, desarrollos puntuales, servicios por hora, pagos fijos y el estado de cobro de cada uno.

La app funciona como PWA: se puede instalar en el celular y queda disponible sin conexión después de la primera carga.

## Qué incluye

- **Hub principal:** MRR, desarrollos del mes, total estimado, cobrado vs. pendiente y proyectos activos.
- **Sidebar adaptable:** menú emergente con sección activa, opción de fijarlo en escritorio y modo compacto de íconos.
- **Micro-SaaS y suscripciones:** MRR, clientes, ciclo de cobro y estado mensual de pago.
- **Desarrollos puntuales:** presupuesto, fecha estimada, estado del proyecto y cobro parcial o total.
- **Tracker de horas integrado:** conserva el calendario de horas y suma automáticamente su total al Hub.
- **Ingresos fijos o extras:** cargos recurrentes o pagos únicos.
- **Montos en ARS o USD:** cada fuente y la tarifa del tracker puede cargarse en su moneda original; el Hub consolida en pesos argentinos con la última cotización USD publicada por el BCRA.
- **Histórico mensual:** elegí el período con las flechas o el selector de mes.
- **Backup:** descarga e importa los datos completos del Hub y del tracker.

## Tus datos

Tus datos financieros se guardan localmente en el dispositivo y no se envían a ningún servidor. Solo se consulta la cotización pública del BCRA, sin transmitir tus ingresos, proyectos ni horas. Los registros de horas de la versión anterior se conservan automáticamente al abrir esta versión.

Para convertir USD, la app consulta la API pública de Estadísticas Cambiarias del BCRA y conserva la última cotización disponible para seguir mostrando conversiones sin conexión. La interfaz siempre muestra la fecha de publicación y actualización de la referencia usada.

Hacé una copia de seguridad antes de borrar los datos del navegador o cambiar de teléfono. Los backups nuevos incluyen fuentes de ingreso y estados de cobro, y la importación sigue aceptando backups anteriores del contador de horas.

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

Cuando cambies `index.html`, `app.js`, `data.js`, íconos o el manifiesto, subí el número de `VERSION` en `sw.js`. Eso permite que los dispositivos reciban la nueva caché.

## Feriados

La app incluye feriados nacionales de Argentina para 2026, sin puentes turísticos. Para otros años, cargalos desde el modo **Feriado** del tracker y verificá las fechas antes de liquidar.
