# Instrucciones de publicación

- GitHub Pages publica exclusivamente desde la rama `main` y la ruta `/`.
- Un `commit` y `push` a una rama de trabajo no constituye un despliegue.
- Cuando el usuario solicite publicar, desplegar o comprobar un arreglo en producción, se debe llevar el cambio a `main` mediante pull request y verificar que GitHub Pages termine correctamente.
- Antes de dar por resuelto un problema observado en la web pública, comprobar que el commit desplegado en `main` contiene el cambio y que el recurso publicado usa la versión de caché esperada.
- No hacer push directo a `main`; usar pull request para conservar trazabilidad.
