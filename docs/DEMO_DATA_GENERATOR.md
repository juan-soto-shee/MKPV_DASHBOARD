# Generador automático de datos Demo

## Alcance y seguridad

El módulo `demo_data_generator/` opera exclusivamente con `clienteId` e `implementationId` `demo_lixiviacion` y `profileId` `lixiviacion`. Está desactivado por defecto, usa Firebase Admin mediante credenciales del entorno y nunca contiene claves. No debe ejecutarse durante build ni tests. Los controles HTTP verifican Firebase ID Token y el documento `admin_users/{email}` con rol `metkinetics_admin`.

## Arquitectura

- `config.js`, `ranges.js`: entorno, límites e identidad fija.
- `generator.js`, `normalGenerator.js`, `acceleratedGenerator.js`: evolución progresiva y ciclos de tres pilas.
- `scenarios.js`: sesgos graduales de los ocho escenarios.
- `timelineManager.js`: fecha, hora, turno, sesión y bloques normales.
- `stateRepository.js`, `firestoreWriter.js`: repositorio de memoria y persistencia Firestore.
- `duplicateGuard.js`: clave lógica e idempotencia.
- `restorationService.js`: cierre, ocultamiento y retorno al calendario real.
- `validation.js`: cliente fijo y máquina de estados.
- `scheduler.js`, `server.js`, `cli.js`: ejecución persistente, API Admin y operación local.

## Estado persistente

`demo_generator_state/current` contiene `clientId`, `estado`, `mode`, `sessionId`, inicio real, tiempo simulado, intervalo, últimos registros normales por pila, valores base/actuales, siguiente horario normal, contadores, límites y último error. El punto de retorno se obtiene sólo de registros con `origen=demo_generator` y `tipoRegistro=automatico_normal` para las tres pilas.

## Modos y restauración

Normal genera un registro por pila cada 240 minutos (configurable), con valores derivados del ciclo anterior. La demo pausa el scheduler normal, guarda el retorno y escribe `timestampCreacion` de servidor junto a `timestampProceso` simulado. Al finalizar se detiene el scheduler, se bloquea la sesión mediante estado, se ocultan sus registros, se invalidan sus predicciones, se restaura la base normal y se calcula el siguiente bloque desde el último ciclo normal y la hora real. La operación es idempotente; un segundo cierre no duplica datos.

Estados: `STOPPED`, `NORMAL_RUNNING`, `NORMAL_PAUSED`, `DEMO_STARTING`, `DEMO_RUNNING`, `DEMO_STOPPING`, `RESTORING_NORMAL`, `ERROR`.

## Variables

Copiar `.env.example` al sistema de secretos del runtime. `DEMO_GENERATOR_ENABLED=false` es el valor seguro. Los intervalos, paso simulado, límites de registros/duración, zona `America/Santiago` y `autoStop` son configurables. Nunca versionar credenciales.

## Comandos

`npm run demo-generator:normal-once`, `normal-start`, `accelerated-start`, `status`, `stop`, `restore` y `server`. Todos salvo `build` exigen habilitación explícita. El Admin requiere configurar `window.PLANTVIEW_DEMO_GENERATOR_API_URL` antes de cargar `admin.js`.

## Admin

La sección Generador Demo muestra estado, modo, tiempos, sesión, retorno, próximo bloque y error. Permite iniciar/pausar normal, iniciar demo con confirmación, generar prueba y finalizar/restaurar con confirmación. No escribe Firestore desde el navegador: llama al backend autenticado.

## Pruebas y recuperación

`npm test` usa exclusivamente `MemoryRepository`. `npm run lint` valida sintaxis y `npm run build` valida configuración sin iniciar el generador. Si restaurar falla, el estado pasa a `ERROR`, la sesión permanece detenida y el retorno se conserva; corregir la causa y ejecutar `npm run demo-generator:restore`.

## Despliegue recomendado

Construir `demo_data_generator/server.js` en Cloud Run con identidad de servicio limitada al proyecto Firebase, mínimo una instancia si se necesita scheduler residente y secretos como variables de entorno. Para máxima robustez, invocar los endpoints idempotentes desde Cloud Scheduler y restringir ingress/CORS al dominio Admin. Antes de producción, desplegar y probar `firestore.rules` en Firebase Emulator y crear los índices compuestos que Firestore solicite para las consultas del retorno.

Para detener: pausar normal o restaurar una demo activa, confirmar `NORMAL_RUNNING`/`NORMAL_PAUSED` en `/status` y luego deshabilitar la instancia. Nunca terminar una instancia durante `RESTORING_NORMAL`.
