# Separación Dashboard Cliente / PlantView Admin

## Dashboard Cliente

Vista operacional, indicadores, gráficos, histórico y exportación. El Perfil Técnico dispone únicamente de alarmas, objetivos KPI y la base para factores autorizados, parámetros operacionales y reportes.

## PlantView Admin

Consola exclusiva de MetKinetics para clientes, implementaciones, importación masiva, eliminación de histórico, variables, layout, usuarios, licencias, branding, respaldos, versiones y configuración global.

## Límite arquitectónico

El dashboard no inicia los módulos de importación o limpieza y oculta sus interfaces heredadas. `js/roles.js` centraliza los cuatro perfiles y capacidades previstas. La consola se mantiene desacoplada en `plantview-admin/` y no accede todavía a servicios de datos.
