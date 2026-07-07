# MetKinetics PlantView

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
