# MetKinetics — Arquitectura

Versión: 1.0  
Actualizado: 2026-07-10

## Mapa general

```text
Sitio corporativo (metkinetics.cl)
            |
            +-- PlantView Web
            |
            +-- PlantView Android
                     |
              Firebase / Firestore
                     |
          clientes, usuarios y roles
```

## Repositorios y responsabilidades

- `juan-soto-shee.github.io`: sitio corporativo y acceso a productos. No contiene la aplicación Android ni debe absorber PlantView sin una migración planificada.
- `MKPV_DASHBOARD`: aplicación PlantView Web, visualización, historial, gráficos, alarmas y configuración web existente.
- `ANDROID`: aplicación móvil PlantView para ingreso y consulta operacional.

## Arquitectura multicliente objetivo

Debe existir una fuente central de contexto activo, reutilizando la solución existente si ya existe. Como mínimo puede incluir:

- `clientId`
- `implementationId`
- nombre de cliente, planta y operación
- rol y permisos del usuario
- variables, unidades, orden, límites y validaciones
- ruta o identificadores Firestore
- URL del dashboard
- branding y textos visibles

No distribuir nombres de clientes ni rutas fijas entre pantallas, ViewModels, repositorios o JavaScript.

## Identidad y autorización

Una configuración fija, JSON local o `BuildConfig` puede servir para desarrollo, pero por sí sola no demuestra perfiles multicliente con una misma APK. Para producción deben verificarse conjuntamente:

- autenticación individual;
- asociación segura usuario–cliente–implementación–rol;
- carga de configuración según el perfil;
- lecturas y escrituras limitadas al cliente autorizado;
- reglas de Firestore que hagan cumplir ese aislamiento;
- manejo seguro de sesiones y errores.

El selector de cliente no debe permitir que un usuario salte a otro cliente sin autorización.

## Firestore

- Mantener el esquema existente hasta documentarlo y aprobar una migración.
- Las rutas de lectura y escritura deben derivarse del contexto autorizado.
- No crear colecciones, migrar datos ni cambiar reglas desde una tarea de interfaz.
- No afirmar aislamiento multicliente basándose solo en filtros del frontend.

## Android

- Una base de código y, como objetivo, una APK común para todos los clientes.
- Formularios y textos deben consumir configuración.
- Guardado, historial y WebView deben usar el mismo contexto activo.
- La URL funcional actual se conserva hasta que `metkinetics.cl/plantview/` esté publicada y validada.

## Web y dominio

- Dominio principal previsto: `https://metkinetics.cl/`.
- Ruta prevista para PlantView: `https://metkinetics.cl/plantview/`.
- No cambiar enlaces Android ni retirar URLs actuales antes de probar DNS, GitHub Pages, HTTPS y compatibilidad de rutas.

## Criterio de aceptación multicliente

No considerar completa esta arquitectura hasta probar al menos dos usuarios de clientes distintos y confirmar que cada uno ve, escribe y consulta solamente sus datos y configuración autorizados.

