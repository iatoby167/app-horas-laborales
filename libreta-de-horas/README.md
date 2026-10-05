# Libreta de Horas

App para marcar los días que trabajaste y calcular las horas y lo que vas a cobrar en el mes. Los feriados trabajados cuentan doble. Funciona sin internet y se instala en el celular como una app.

## Qué hay en la carpeta

- `index.html`: la app completa.
- `manifest.webmanifest` y los `.png`: nombre e ícono para instalarla.
- `sw.js`: lo que la deja funcionando sin internet.

No cambies los nombres ni muevas los archivos a subcarpetas.

## Cómo publicarla gratis (GitHub Pages)

Para instalarla en el celular tiene que estar en una dirección web con https. Estos pasos se hacen desde el navegador:

1. Creá una cuenta gratis en github.com.
2. Tocá **New repository**, poné un nombre (por ejemplo `horas`), dejalo en **Public** y tocá **Create repository**.
3. Elegí **uploading an existing file**, subí todos los archivos de esta carpeta y tocá **Commit changes**.
4. Andá a **Settings → Pages**. En **Source** elegí **Deploy from a branch**, en **Branch** elegí `main` y la carpeta `/ (root)`, y tocá **Save**.
5. A los uno o dos minutos aparece la dirección, con la forma `https://TUUSUARIO.github.io/horas/`.

El repositorio público solo tiene el código. Tus días y tu valor por hora quedan guardados en el teléfono, nunca en GitHub.

Alternativa: en app.netlify.com/drop podés arrastrar la carpeta. Creá una cuenta para que el sitio no se borre.

## Instalarla en el celular

- **Android (Chrome):** abrí la dirección y tocá **Instalar** en el aviso de arriba. Si no aparece, usá el menú ⋮ y elegí **Instalar app** o **Agregar a la pantalla principal**.
- **iPhone (Safari):** abrí la dirección, tocá **Compartir** y elegí **Agregar a inicio**. Tiene que ser Safari.

La primera vez abrila con internet. Después anda sin conexión. Las fuentes se bajan de Google Fonts en esa primera vez; si nunca se bajaron, se ve con la letra del sistema.

## Tus datos

Se guardan en el dispositivo donde usás la app, por eso no se ven en otro teléfono ni en la compu. Descargá un backup de vez en cuando desde **Copia de seguridad**, sobre todo antes de borrar los datos del navegador o de cambiar de teléfono. Para pasarlos a otro dispositivo, descargá el backup en uno e importalo en el otro.

Si ya venías usando la versión de Claude, descargá el backup desde ahí e importalo en esta.

## Probarla en tu compu

```
cd carpeta-de-la-app
python3 -m http.server 8000
```

Abrí `http://localhost:8000`. Abrir `index.html` con doble clic funciona para ver la app, pero no se puede instalar.

## Actualizar la app

Reemplazá los archivos en el repositorio. Si cambiás algo que no sea `index.html`, subí el número de `VERSION` en `sw.js` para que los dispositivos tomen la versión nueva.

## Feriados

Vienen cargados los feriados nacionales de 2026, sin los puentes turísticos. Verificalos contra la fuente oficial. Para otros años, o para sumar un puente, usá el modo **Feriado** del calendario.
