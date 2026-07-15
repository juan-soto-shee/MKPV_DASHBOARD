# Auditoría de seguridad mínima — 2026-07-14

## Resultado inmediato

- Se eliminaron del frontend las claves administrativas, técnicas, demo y Mantos Blancos.
- El dashboard web ahora exige Firebase Authentication con Google.
- La autorización se valida contra el documento `admin_users/{email}` ya usado por PlantView Admin.
- El acceso falla de forma cerrada si el documento no existe, `activo` no es `true`, el rol no es `technical_profile` o `metkinetics_admin`, o la implementación no está autorizada.
- Se eliminó el bypass basado en WebView, objetos JavaScript o `user-agent`.
- Guardar alarmas, guardar KPI y ejecutar limpieza legacy exige una sesión autorizada en el frontend.

## Formato de autorización utilizado

Documento: `admin_users/{email_en_minusculas}`.

```json
{
  "activo": true,
  "rol": "metkinetics_admin",
  "implementationIds": ["demo_lixiviacion", "solmin_mantos_blancos"]
}
```

`implementationIds` es opcional por compatibilidad con los administradores existentes. Para nuevas cuentas debe declararse. El valor `"*"` autoriza todas las implementaciones.

## Reglas de Firestore

No se encontró `firestore.rules`, `firebase.json` ni una exportación de las reglas actualmente desplegadas. Por ello las reglas existentes no pudieron auditarse ni modificarse con trazabilidad. Los bloqueos del frontend mejoran la interfaz, pero **no sustituyen reglas de servidor**.

Antes de publicar estos cambios hay que obtener las reglas desplegadas desde Firebase Console/CLI y verificar como mínimo:

1. `admin_users/{email}`: un usuario autenticado solo puede leer el documento correspondiente a su propio correo; ningún cliente puede crearlo, modificarlo ni borrarlo.
2. `leach_records`: lectura limitada a los `clienteId` autorizados; creación/importación solo con rol permitido y `clienteId` autorizado; actualización y borrado denegados salvo roles explícitos.
3. `configuration` y la colección legacy de alarmas: lectura para usuarios autorizados; escritura solo para `technical_profile` o `metkinetics_admin`.
4. Configuración KPI: la misma política de escritura técnica/administrativa.
5. `audit_log`: creación administrativa con campos controlados; lectura restringida; actualización y borrado denegados.
6. Las reglas deben validar autorización en datos protegidos por el servidor (claims o documentos no editables por el usuario), no confiar en parámetros URL ni en `clienteId` enviado por el navegador.

## Operaciones sensibles encontradas

| Operación | Implementación | Riesgo restante |
|---|---|---|
| Lectura en tiempo real e histórica | `js/firestoreService.js` | Depende completamente de reglas por `clienteId`. |
| Guardado de alarmas | `js/alarmAdmin.js` | Bloqueado en UI por rol; falta confirmar regla de escritura. |
| Guardado de KPI | `js/app.js`, `js/kpiConfigService.js` | Bloqueado en UI por rol; falta confirmar regla de escritura. |
| Importación masiva legacy | `js/bulkImport.js`, `js/firestoreService.js` | La interfaz principal está oculta, pero la seguridad real depende de reglas. |
| Importación PlantView Admin | `plantview-admin/modules/bulkImport.js` | Usa Auth y allowlist; falta confirmar reglas de lote y `clienteId`. |
| Borrado histórico Admin | `plantview-admin/modules/deleteHistory.js` | Usa Auth, confirmación y auditoría; falta confirmar reglas de borrado. |
| Borrado/reinicio y limpieza legacy | `js/firestoreService.js`, `js/legacyCleanup.js` | La limpieza exige rol en UI; las funciones deben quedar denegadas por reglas a otros usuarios. |

## Pendientes obligatorios

- Rotar las cuatro claves eliminadas: estuvieron en un repositorio público y deben considerarse comprometidas.
- Confirmar que Google está habilitado como proveedor en Firebase Authentication y que el dominio actual está autorizado.
- Crear o revisar los documentos `admin_users` necesarios. Hasta entonces el acceso queda bloqueado de forma intencional.
- Exportar, versionar y probar reglas de Firestore con Emulator Suite antes de desplegarlas.
- Diseñar acceso de clientes no administrativos (roles de visualización y asignación por implementación). El MVP actual permite solamente roles técnicos/administradores.
- Probar el nuevo flujo en Android antes de publicar: el bypass inseguro se eliminó, pero no se modifició ningún archivo Android en esta etapa.
