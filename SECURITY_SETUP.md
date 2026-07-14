# Seguridad de PlantView

## Modelo de acceso

- El dashboard de clientes usa usuario y contrasena entregados por MetKinetics.
- Firebase Authentication utiliza internamente `usuario@users.metkinetics.cl`; ese correo tecnico no se muestra al operador.
- El acceso se concede mediante `user_access/{uid}` y siempre se limita por `clienteIds`.
- El rol `operador` consulta y envia datos de sus implementaciones autorizadas.
- El rol `tecnico` tambien puede modificar la configuracion de los perfiles incluidos en `profileIds`.
- PlantView Admin permanece separado y usa Google con rol `metkinetics_admin`.
- Ninguna contrasena se guarda en JavaScript, JSON ni Git.

## Usuarios iniciales aprobados

| Usuario | Rol | Cliente | Perfil |
| --- | --- | --- | --- |
| `demo` | `operador` | `demo_lixiviacion` | `lixiviacion` |
| `demotec` | `tecnico` | `demo_lixiviacion` | `lixiviacion` |
| `mantos` | `operador` | `solmin_mantos_blancos` | `entrefases` |
| `mantostec` | `tecnico` | `solmin_mantos_blancos` | `entrefases` |

Las contrasenas se crean y entregan fuera del repositorio. Deben ser memorizables, diferentes por cuenta y no contener anos ni fechas.

## Documento de autorizacion operacional

Crear `user_access/{uid}`:

```json
{
  "activo": true,
  "username": "mantos",
  "rol": "operador",
  "clienteIds": ["solmin_mantos_blancos"],
  "profileIds": []
}
```

## Documento de autorización tecnica

Crear `user_access/{uid}`:

```json
{
  "activo": true,
  "username": "mantostec",
  "rol": "tecnico",
  "clienteIds": ["solmin_mantos_blancos"],
  "profileIds": ["entrefases"]
}
```

El `uid` se obtiene al crear la identidad interna en Firebase Authentication.

## Superadministrador

PlantView Admin mantiene Google. Crear `admin_users/{email-en-minusculas}`:

```json
{
  "activo": true,
  "email": "admin@metkinetics.cl",
  "nombre": "Administrador",
  "rol": "metkinetics_admin"
}
```

## Activacion en Firebase

1. Habilitar Correo electronico/contrasena en Authentication.
2. Mantener Google habilitado para PlantView Admin.
3. Crear las identidades internas y sus documentos `user_access/{uid}`.
4. Desplegar `firestore.rules` solo despues de crear las autorizaciones.

```text
firebase deploy --only firestore:rules
```

## Android

Android usara los mismos usuarios y contrasenas. Antes de leer o crear registros debera iniciar sesion y conservar la sesion de Firebase Authentication.
