# MetKinetics PlantView Dashboard

Demo web estatica para visualizar datos operacionales de PlantView usando Firebase Firestore en tiempo real.

## Arquitectura multi-cliente

La configuracion queda separada en dos conceptos:

- Perfil Operacional: define el proceso reutilizable. Incluye variables, alarmas, layout y proceso/equipos. No contiene nombres de cliente, empresa ni faena.
- Implementacion: define un cliente/faena concreta y apunta a un perfil operacional mediante `profileId`.

Esto permite que varios clientes usen el mismo perfil operacional sin mezclar datos, porque los registros se filtran por `clienteId`.

## Estructura nueva

```text
config/
  activeImplementation.json
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
  customers/
    demo_lixiviacion/
      client.json
    solmin_mantos_blancos/
      client.json
```

## Como se carga la implementacion activa

La prioridad de seleccion es:

1. Parametro de URL `?implementation=demo_lixiviacion`.
2. `config/activeImplementation.json`.
3. Parametro legacy `?profile=...`.
4. Fallback legacy `config/activeClient.json`.

Ejemplo:

```json
{
  "activeImplementation": "demo_lixiviacion"
}
```

## Como crear un perfil reutilizable

Crear una carpeta en `config/profiles/{profileId}/` con:

- `variables.json`
- `alarms.json`
- `layout.json`
- `process.json`

El perfil debe describir solo el comportamiento operacional: variables, unidades, limites, equipos, relaciones y orden visual.

No debe incluir:

- `clientName`
- `siteName`
- `clienteId`
- nombre de empresa
- nombre de faena

Ejemplo de perfil:

```text
config/profiles/entrefases/
```

Clientes que podrian usarlo:

- `solmin_mantos_blancos`
- `cliente_b_entrefases`
- `cliente_c_entrefases`

## Como crear un cliente nuevo

Crear:

```text
config/customers/{implementationId}/client.json
```

Ejemplo:

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

`implementationId` identifica la implementacion activa. `profileId` identifica el perfil tecnico reutilizable. `clienteId` es el valor usado para consultar, importar y eliminar registros en Firestore.

## Implementaciones disponibles

### Demo Lixiviacion

- Implementacion: `demo_lixiviacion`
- Perfil operacional: `lixiviacion`
- Cliente ID: `demo_lixiviacion`

URL:

```text
index.html?implementation=demo_lixiviacion
```

### Solmin Mantos Blancos

- Implementacion: `solmin_mantos_blancos`
- Perfil operacional: `entrefases`
- Cliente ID: `solmin_mantos_blancos`

URL:

```text
index.html?implementation=solmin_mantos_blancos
```

## Uso de datos

- Las graficas, layout, equipos y alarmas usan el perfil operacional (`profileId`).
- La identidad visual y la tarjeta de administracion usan el customer/implementacion.
- Firestore se filtra siempre por `clienteId`.
- La importacion masiva asigna automaticamente `clienteId = clientConfig.clienteId`.
- El borrado historico protegido elimina solo documentos con `clienteId == clientConfig.clienteId`.
- No se usa `profileId` para filtrar datos, porque varios clientes pueden compartir el mismo perfil.

## Compatibilidad legacy temporal

Se conservan estas rutas legacy para no romper GitHub Pages ni configuraciones existentes:

```text
config/clientes/demo_lixiviacion/
config/clientes/entrefases_profile/
config/activeClient.json
```

La aplicacion prefiere la estructura nueva. Si falta algun JSON nuevo, intenta usar estas rutas legacy como fallback temporal.

No se eliminaron registros ni se importaron datos durante esta migracion.

## Ejecutar localmente

Abre `index.html` desde un servidor estatico local o publicalo directamente en GitHub Pages.

```powershell
python -m http.server 8080
```

Luego visita:

```text
http://localhost:8080
```

## Firebase

No modificar `js/firebaseConfig.js` para cambiar clientes. La seleccion de cliente/faena se hace mediante `config/activeImplementation.json` o el parametro `?implementation=`.

La app escucha la coleccion `leach_records` filtrando por `clienteId`.
