# MetKinetics PlantView

## Configuración por cliente

La aplicación carga el cliente indicado en `config/activeClient.json`. La
configuración del demo actual vive en `config/clientes/demo_lixiviacion/`:

- `identidad.json`: identidad, proceso y rutas lógicas de Firebase.
- `variables.json`: variables, nombres, unidades, decimales, gráficos y reglas
  de agregación.
- `limitesAlarmas.json`: límites iniciales y asociación variable/equipo.
- `equipos.json`: áreas, equipos, tipos y alias de entrada.
- `layoutVisible.json`: secciones, periodos, textos y orden visible.

Para incorporar otro cliente, copie esa carpeta, ajuste sus JSON y cambie
únicamente el valor `activeClient` de `config/activeClient.json`. No existe un
configurador de cliente en la interfaz.

Los límites guardados en Firestore continúan teniendo prioridad sobre los
valores iniciales del JSON. Se conservan las colecciones y documentos actuales,
incluida la lectura compatible de la configuración heredada.

### Perfil piloto Entrefases

El perfil tecnico `entrefases_profile` queda disponible en
`config/clientes/entrefases_profile/`. Para activarlo, cambie en
`config/activeClient.json`:

```json
{
  "activeClient": "demo_lixiviacion"
}
```

por:

```json
{
  "activeClient": "entrefases_profile"
}
```

No se incluyen datos importados para este perfil. El mapeo interno de la
planilla futura esta documentado en
`config/clientes/entrefases_profile/mappingPlanilla.md`.

Demo web estática para visualizar datos operacionales de una planta de lixiviación usando Firebase Firestore en tiempo real.

## Ejecutar

Abre `index.html` desde un servidor estático local o publícalo directamente en GitHub Pages.

```powershell
python -m http.server 8080
```

Luego visita `http://localhost:8080`.

## Firebase

Reemplaza los valores de `js/firebaseConfig.js` con la configuración real del proyecto Firebase.

La app escucha la colección `leach_records`, ordenada por `timestampCreacion` descendente. Si Firestore está vacío o la configuración sigue como ejemplo, se usa `data/demoData.js`.

## Estructura

- `index.html`
- `css/style.css`
- `js/firebaseConfig.js`
- `js/firestoreService.js`
- `js/app.js`
- `js/charts.js`
- `js/processMap.js`
- `data/demoData.js`
- `assets/`
