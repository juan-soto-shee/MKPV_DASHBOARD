const baseDate = new Date();

function minutesAgo(minutes) {
  return new Date(baseDate.getTime() - minutes * 60 * 1000).toISOString();
}

export const demoRecords = [
  {
    id: "demo-001",
    timestampCreacion: minutesAgo(4),
    turno: "A",
    area: "Piscina PLS",
    operador: "C. Muñoz",
    estado: "Alerta",
    observacion: "Nivel PLS bajo tendencia operacional.",
    phPLS: 1.68,
    cuPLS: 5.7,
    flujoRiego: 1260,
    acidoLibre: 8.4,
    nivelPiscinaPLS: 62,
    alertasActivas: 3
  },
  {
    id: "demo-002",
    timestampCreacion: minutesAgo(22),
    turno: "A",
    area: "Riego de Pilas",
    operador: "M. Torres",
    estado: "Normal",
    observacion: "Caudal estable en áreas 2 y 3.",
    phPLS: 1.71,
    cuPLS: 5.5,
    flujoRiego: 1320,
    acidoLibre: 8.1,
    nivelPiscinaPLS: 66,
    alertasActivas: 2
  },
  {
    id: "demo-003",
    timestampCreacion: minutesAgo(38),
    turno: "A",
    area: "SX",
    operador: "P. Rojas",
    estado: "Normal",
    observacion: "Continuidad metalúrgica dentro de rango.",
    phPLS: 1.74,
    cuPLS: 5.4,
    flujoRiego: 1295,
    acidoLibre: 7.8,
    nivelPiscinaPLS: 68,
    alertasActivas: 1
  },
  {
    id: "demo-004",
    timestampCreacion: minutesAgo(61),
    turno: "N",
    area: "Apilamiento",
    operador: "D. Vega",
    estado: "Alerta",
    observacion: "Desviación menor en humedad de mineral.",
    phPLS: 1.79,
    cuPLS: 5.1,
    flujoRiego: 1210,
    acidoLibre: 7.2,
    nivelPiscinaPLS: 71,
    alertasActivas: 2
  },
  {
    id: "demo-005",
    timestampCreacion: minutesAgo(84),
    turno: "N",
    area: "Chancado",
    operador: "A. Fuentes",
    estado: "Normal",
    observacion: "Alimentación regular hacia apilamiento.",
    phPLS: 1.82,
    cuPLS: 4.9,
    flujoRiego: 1188,
    acidoLibre: 7,
    nivelPiscinaPLS: 73,
    alertasActivas: 1
  },
  {
    id: "demo-006",
    timestampCreacion: minutesAgo(109),
    turno: "N",
    area: "EW",
    operador: "L. Castillo",
    estado: "Crítico",
    observacion: "Celda con desviación de voltaje requiere revisión.",
    phPLS: 1.86,
    cuPLS: 4.7,
    flujoRiego: 1140,
    acidoLibre: 6.6,
    nivelPiscinaPLS: 76,
    alertasActivas: 4
  },
  {
    id: "demo-007",
    timestampCreacion: minutesAgo(136),
    turno: "N",
    area: "Cátodos",
    operador: "S. Álvarez",
    estado: "Normal",
    observacion: "Producción conforme a plan semanal.",
    phPLS: 1.78,
    cuPLS: 5,
    flujoRiego: 1198,
    acidoLibre: 7.4,
    nivelPiscinaPLS: 74,
    alertasActivas: 1
  },
  {
    id: "demo-008",
    timestampCreacion: minutesAgo(164),
    turno: "B",
    area: "Riego de Pilas",
    operador: "F. Herrera",
    estado: "Normal",
    observacion: "Distribución de riego balanceada.",
    phPLS: 1.73,
    cuPLS: 5.3,
    flujoRiego: 1275,
    acidoLibre: 7.9,
    nivelPiscinaPLS: 70,
    alertasActivas: 1
  }
];

export const demoProcess = [
  { name: "Chancado", state: "Normal", metric: "92% disponibilidad" },
  { name: "Apilamiento", state: "Alerta", metric: "Humedad 8.6%" },
  { name: "Riego de Pilas", state: "Normal", metric: "1.260 m3/h" },
  { name: "Piscina PLS", state: "Alerta", metric: "Nivel 62%" },
  { name: "SX", state: "Normal", metric: "Continuidad OK" },
  { name: "EW", state: "Crítico", metric: "Celda 14 en revisión" },
  { name: "Cátodos", state: "Normal", metric: "99.1% calidad" }
];
