# Rutas legacy temporales

Estas rutas se conservan temporalmente por compatibilidad:

- `config/clientes/demo_lixiviacion/`
- `config/clientes/entrefases_profile/`
- `config/activeClient.json`

La aplicacion prefiere la estructura nueva:

- `config/activeImplementation.json`
- `config/customers/{implementationId}/client.json`
- `config/profiles/{profileId}/`

No eliminar las rutas legacy hasta completar la migracion de clientes y accesos existentes.
