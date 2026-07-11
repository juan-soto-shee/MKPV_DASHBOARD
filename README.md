# MetKinetics PlantView

MetKinetics PlantView es una plataforma web de monitoreo operacional para múltiples procesos industriales. La interfaz obtiene la identidad del cliente, la faena y el proceso desde la implementación activa; ningún perfil operacional funciona como identidad de cliente.

## Arquitectura

```text
MetKinetics PlantView
        ↓
Implementación (cliente, faena, proceso y clienteId)
        ↓
Perfil Operacional (variables, alarmas, layout y equipos)
        ↓
Variables
        ↓
Datos Firestore filtrados por clienteId
```

- **Implementación:** instancia concreta definida en `config/customers/{implementationId}/client.json`.
- **Perfil Operacional:** configuración técnica reutilizable definida en `config/profiles/{profileId}/`.
- **clienteId:** identificador exclusivo usado para consultar, importar y eliminar datos.

El `profileId` nunca se usa para asociar registros. Varias implementaciones pueden compartir un perfil sin mezclar sus datos.

## Estructura de configuración

```text
config/
  activeImplementation.json
  customers/
    demo_lixiviacion/client.json
    solmin_mantos_blancos/client.json
  profiles/
    lixiviacion/
      variables.json
      alarms.json
      layout.json
      process.json
    entrefases/
      variables.json
      alarms.json
      layout.json
      process.json
```

Cada `client.json` declara de forma independiente:

```json
{
  "implementationId": "solmin_mantos_blancos",
  "clienteId": "solmin_mantos_blancos",
  "clientName": "Solmin",
  "siteName": "Mantos Blancos",
  "processName": "Planta Entrefases",
  "profileId": "entrefases",
  "version": "1.0",
  "enabled": true
}
```

## Selección de implementación

La prioridad es:

1. Parámetro URL `?implementation=`.
2. `config/activeImplementation.json`.
3. Parámetro temporal `?profile=` como compatibilidad legacy.
4. `config/activeClient.json` como fallback legacy.

Ejemplos:

```text
index.html?implementation=demo_lixiviacion
index.html?implementation=solmin_mantos_blancos
```

## Implementaciones incluidas

| Implementación | Cliente | Faena | Proceso | Perfil Operacional |
|---|---|---|---|---|
| `demo_lixiviacion` | MetKinetics Demo | Faena Demo | Lixiviación | `lixiviacion` |
| `solmin_mantos_blancos` | Solmin | Mantos Blancos | Planta Entrefases | `entrefases` |

## Datos y administración

- El listener principal consulta `leach_records` con `where("clienteId", "==", clientConfig.clienteId)`.
- La importación masiva asigna el `clienteId` de la implementación activa.
- Los registros nuevos de la demo incluyen `clienteId = "demo_lixiviacion"` y `timestampCreacion`.
- La herramienta **Limpiar Datos Legacy Demo** solo aparece en `demo_lixiviacion`.
- Esa herramienta se ejecuta manualmente, pide doble confirmación y solo elimina documentos sin `clienteId` identificados con seguridad como datos artificiales antiguos de la demo.
- Los documentos con cualquier `clienteId`, incluidos los de `solmin_mantos_blancos`, quedan protegidos.

## Compatibilidad legacy

Las rutas antiguas bajo `config/clientes/` y `config/activeClient.json` se conservan temporalmente para no romper despliegues existentes. La aplicación prefiere siempre `config/customers/`, `config/profiles/` y `config/activeImplementation.json`.

## Ejecución local y GitHub Pages

El proyecto usa rutas relativas y no necesita un proceso de compilación, por lo que puede publicarse directamente en GitHub Pages.

GitHub Pages está configurado para publicar únicamente la rama `main` desde la raíz (`/`). Subir cambios a una rama de trabajo no actualiza el sitio público: la publicación se considera terminada solo después de integrar el pull request en `main` y comprobar que el despliegue de Pages finalizó correctamente.

```powershell
python -m http.server 8080
```

Luego abre `http://localhost:8080`.

No se debe modificar `js/firebaseConfig.js` para seleccionar clientes. La selección se realiza con `?implementation=` o `config/activeImplementation.json`.
