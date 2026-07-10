# MetKinetics — Roadmap

Actualizado: 2026-07-10

Los estados de este documento deben basarse en evidencia del repositorio o pruebas. No convertir antecedentes conversacionales en funciones terminadas sin verificarlos.

## Estado conocido

- [x] Dominio `metkinetics.cl` adquirido.
- [x] Repositorio corporativo `juan-soto-shee.github.io` creado en GitHub.
- [x] PlantView Web existe en `MKPV_DASHBOARD`.
- [x] Proyecto Android existe en `ANDROID`.
- [ ] Repositorio corporativo clonado localmente en este equipo (no encontrado al crear estos documentos).
- [ ] Landing corporativa implementada, revisada y publicada.
- [ ] GitHub Pages y dominio personalizado validados con HTTPS.
- [ ] PlantView disponible y probado en `metkinetics.cl/plantview/`.
- [ ] Android actualizado y probado contra la URL definitiva.

## Prioridad inmediata

1. Auditar los últimos cambios Android y recuperar el último estado bueno si hubo regresiones.
2. Verificar la cadena multicliente real: login → perfil → cliente/implementación → configuración → Firestore → Web.
3. Compilar y probar Android sin refactorizaciones amplias.
4. Crear y revisar una landing corporativa mínima.
5. Publicar primero en `juan-soto-shee.github.io`.
6. Configurar DNS, dominio personalizado y HTTPS.
7. Migrar enlaces a la URL definitiva de forma controlada.

## Validaciones obligatorias de Android

- [ ] Una sola base de código atiende a los clientes configurados.
- [ ] Cada usuario posee perfil, cliente/implementación y rol verificables.
- [ ] El formulario proviene de configuración, no de código específico por cliente.
- [ ] Escritura e historial usan el contexto autorizado.
- [ ] Reglas Firestore bloquean acceso cruzado.
- [ ] WebView usa una URL centralizada con fallback válido.
- [ ] Estados de sincronización y prevención de doble envío siguen operativos.
- [ ] `assembleDebug` termina correctamente.
- [ ] Prueba real con dos clientes confirma aislamiento.

## Más adelante

- Consolidar proceso de alta de clientes desde configuración.
- Completar HydroSim.
- Completar Safety.
- Documentar despliegue, respaldo, recuperación y soporte.

