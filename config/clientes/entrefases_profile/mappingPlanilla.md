# Mapeo interno de planilla Entrefases

Archivo origen futuro: `Datos Planta EF SOLMIN.xlsx`

No importar datos hasta que el perfil sea activado y validado.

Cada registro importado debe incluir:

```json
{
  "clienteId": "entrefases_profile"
}
```

## Columnas

| Columna planilla | Campo PlantView |
| --- | --- |
| FECHA_HORA | timestampCreacion / fecha / hora / turno |
| BBA_110_ESTADO | bba110Estado |
| BBA_110_FLUJO_M3H | bba110Flujo |
| BBA_110_VDF_PORCENTAJE | bba110Vdf |
| BBA_110_AMP | bba110Amp |
| BBA_110_HZ | bba110Hz |
| BBA_100_ESTADO | bba100Estado |
| BBA_100_FLUJO_M3H | bba100Flujo |
| PISCINA_PLS_NIVEL_PORCENTAJE | piscinaPlsNivel |
| PISCINA_ILS_NIVEL_PORCENTAJE | piscinaIlsNivel |
| BBA_FLOTANTE_PLS_VDF_PORCENTAJE | bbaFlotantePlsVdf |
| BBA_FLOTANTE_PLS_AMP | bbaFlotantePlsAmp |
