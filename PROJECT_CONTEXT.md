# MetKinetics — Contexto del proyecto

Versión: 1.0  
Actualizado: 2026-07-10

## Propósito

MetKinetics es una plataforma comercial de software industrial para minería e hidrometalurgia. La suite contempla PlantView, HydroSim, Safety y futuros productos.

## Principio de producto

- Una base de código para PlantView Web.
- Una base de código para la aplicación Android.
- Una infraestructura Firebase/Firestore compartida, con aislamiento seguro por cliente.
- Las diferencias entre clientes deben resolverse mediante configuración, no duplicando proyectos, pantallas o repositorios.

Agregar un cliente debe ser principalmente una tarea de configuración: identidad, planta, variables, unidades, límites, branding, permisos y rutas de datos.

## Componentes conocidos

- Sitio corporativo: repositorio `juan-soto-shee.github.io`.
- PlantView Web: repositorio `MKPV_DASHBOARD`.
- PlantView Android: proyecto `ANDROID`.
- Dominio corporativo adquirido: `metkinetics.cl`.
- Servicios de datos: Firebase y Firestore.

## Objetivo multicliente

Una misma aplicación debe atender a distintos clientes y usuarios. El flujo objetivo es:

1. El usuario se autentica.
2. Su perfil determina `clientId`, `implementationId` y rol.
3. La app carga la configuración autorizada de esa implementación.
4. Formulario, historial, escritura de datos y dashboard utilizan el mismo contexto.
5. Las reglas del backend impiden el acceso cruzado entre clientes.

Este flujo es un objetivo de arquitectura. No debe declararse terminado hasta verificar autenticación, perfiles, reglas y pruebas reales de aislamiento.

## Reglas de trabajo

Antes de modificar archivos:

1. Confirmar la ruta y el proyecto abierto.
2. Leer `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `ROADMAP.md` y `CODING_RULES.md`.
3. Inspeccionar la implementación existente; no asumirla.
4. Identificar impacto en Android, Web, Firebase/Firestore y dominio.
5. Aplicar el cambio mínimo solicitado y verificarlo.

## Límites

- No crear una app, dashboard o proyecto Firebase por cliente sin una decisión explícita.
- No cambiar `package name`, `applicationId`, rutas de Firestore, reglas o esquema de datos sin autorización.
- No modificar otros proyectos por proximidad en el sistema de archivos.
- No hacer `git push`, despliegues, migraciones o cambios DNS automáticamente.

