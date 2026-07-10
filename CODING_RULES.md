# MetKinetics — Reglas para Codex

Versión: 1.0  
Actualizado: 2026-07-10

## Antes de actuar

1. Mostrar o verificar la ruta absoluta de trabajo.
2. Confirmar qué proyecto está abierto y su estructura real.
3. Leer los cuatro documentos de contexto completos.
4. Revisar `git status` y preservar cambios del usuario.
5. Explicar brevemente los archivos que se pretende modificar y el impacto esperado.
6. Si la carpeta no corresponde, detenerse sin crear archivos ni buscar otra automáticamente.

## Alcance

- Trabajar únicamente en el proyecto solicitado.
- Hacer cambios pequeños, reversibles y directamente relacionados con la tarea.
- Reutilizar arquitectura, modelos, repositorios y convenciones existentes.
- No interpretar una auditoría como autorización para reescribir.
- No ampliar el alcance por iniciativa propia.

## Prohibiciones

- No crear proyectos paralelos ni variantes por cliente.
- No duplicar pantallas, ViewModels, repositorios, dashboards o configuraciones.
- No realizar refactorizaciones generales, renombrados masivos ni cambios cosméticos ajenos.
- No cambiar `package name`, `applicationId`, credenciales, esquema o reglas de Firebase/Firestore sin autorización explícita.
- No instalar dependencias ni frameworks sin necesidad aprobada.
- No borrar cambios existentes ni usar comandos destructivos para recuperar archivos.
- No hacer commit, push, despliegue, publicación ni cambios DNS salvo solicitud explícita.
- No declarar pruebas externas exitosas si no se ejecutaron realmente.

## Multicliente

- No hardcodear clientes en lógica distribuida.
- No asumir que un JSON fijo equivale a perfiles multicliente.
- Mantener alineados usuario, rol, `clientId`, `implementationId`, configuración, ruta de datos y dashboard.
- El aislamiento debe estar respaldado por reglas del backend, no solo por la interfaz.
- Cualquier cambio de esquema o ruta requiere un plan de compatibilidad y migración.

## Verificación

- Ejecutar la prueba o compilación más acotada que cubra el cambio.
- En Android, usar el wrapper Gradle del proyecto y reportar el comando exacto.
- Revisar el diff final y confirmar que no haya archivos ajenos modificados.
- Informar con precisión qué se probó, qué no se pudo probar y qué riesgos quedan.

## Recuperación ante regresiones

Si el proyecto retrocedió:

1. Detener nuevos cambios.
2. Identificar los archivos y commits afectados.
3. Comparar con el último estado bueno.
4. Proponer una recuperación quirúrgica.
5. No ejecutar reset, checkout destructivo ni sobrescrituras masivas sin autorización.

