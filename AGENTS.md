# Preferencias de trabajo y publicación

El usuario pidió que, de ahora en adelante, cada cambio de la app se suba a GitHub como versión de prueba, conservando una vuelta fácil a la versión normal.

- Repositorio: https://github.com/iatoby167/app-horas-laborales
- Trabajar y subir los cambios a la rama `pruebas`. Verificar estado, diferencias y remoto antes de cada commit; preservar trabajo ajeno y no subir secretos, datos personales, backups, node_modules ni dist.
- Después de implementar un cambio pedido, ejecutar las pruebas pertinentes, hacer commit de los archivos de ese cambio y push a `origin pruebas`. Esta publicación de pruebas está autorizada por la preferencia del usuario; no pedir confirmación rutinaria otra vez.
- El push inicia `.github/workflows/windows-prueba.yml`, que genera una GitHub Pre-release y un instalador de prueba. Verificar el resultado y entregar el enlace; si falla la autenticación o la compilación, informar el estado real.
- Nunca fusionar a `main`, publicar una Release estable, marcar una prueba como Latest ni reemplazar el instalador estable salvo pedido explícito del usuario de promover a estable.
- La app de prueba usa appId, nombre, almacenamiento, caché y canal `prueba` independientes. No compartir su perfil con el de la app normal ni importar datos automáticamente.
- Para volver a la versión normal, el usuario abre su app normal. Si necesita probar con registros existentes, exporta un backup desde la normal y lo importa en la prueba. No prometer que los cambios hechos en la prueba se copian a la normal.
- No sobrescribir versiones publicadas ni reescribir historia remota. Para corregir una prueba, hacer un nuevo commit: el workflow le asigna una versión nueva.

## Verificación local

`npm test`, `npm run test:updates-ui`, `npm run test:ui`, `npm run test:workspace-ui`.
`npm run dist:prueba` genera un instalador local de prueba sin publicar.
`npm run dist` genera el instalador normal sin publicar; no promoverlo sin autorización explícita.
