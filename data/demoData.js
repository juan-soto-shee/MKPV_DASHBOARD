const baseDate = new Date();

function minutesAgo(minutes) {
  return new Date(baseDate.getTime() - minutes * 60 * 1000).toISOString();
}

export const demoRecords = [
  {
    id: "demo-001",
    fecha: new Date().toLocaleDateString("es-CL"),
    hora: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    timestampCreacion: minutesAgo(5),
    turno: "A",
    area: "Lixiviacion",
    subarea: "Piscina PLS",
    operador: "C. Munoz",
    estado: "Alerta",
    observacion: "Nivel PLS bajo tendencia operacional.",
    flujoPLS: 1260,
    acidezRefino: 8.4,
    cuPls: 5.7,
    nivelPiscinaRefino: 73,
    nivelPiscinaPLS: 58
  },
  {
    id: "demo-002",
    timestampCreacion: minutesAgo(24),
    turno: "A",
    area: "Lixiviacion",
    subarea: "Pila 1",
    operador: "M. Torres",
    estado: "Normal",
    observacion: "Caudal estable en riego.",
    flujoPLS: 1320,
    acidezRefino: 8.1,
    cuPls: 5.5,
    nivelPiscinaRefino: 74,
    nivelPiscinaPLS: 61
  },
  {
    id: "demo-003",
    timestampCreacion: minutesAgo(48),
    turno: "A",
    area: "Lixiviacion",
    subarea: "Pila 2",
    operador: "P. Rojas",
    estado: "Normal",
    observacion: "Continuidad metalurgica dentro de rango.",
    flujoPLS: 1295,
    acidezRefino: 7.8,
    cuPls: 5.4,
    nivelPiscinaRefino: 76,
    nivelPiscinaPLS: 64
  },
  {
    id: "demo-004",
    timestampCreacion: minutesAgo(72),
    turno: "N",
    area: "Lixiviacion",
    subarea: "Pila 3",
    operador: "D. Vega",
    estado: "Alerta",
    observacion: "Desviacion menor de flujo en riego.",
    flujoPLS: 1145,
    acidezRefino: 7.2,
    cuPls: 5.1,
    nivelPiscinaRefino: 78,
    nivelPiscinaPLS: 67
  },
  {
    id: "demo-005",
    timestampCreacion: minutesAgo(96),
    turno: "N",
    area: "Lixiviacion",
    subarea: "Piscina Refino",
    operador: "A. Fuentes",
    estado: "Normal",
    observacion: "Nivel de refino estable.",
    flujoPLS: 1188,
    acidezRefino: 7.0,
    cuPls: 4.9,
    nivelPiscinaRefino: 80,
    nivelPiscinaPLS: 69
  },
  {
    id: "demo-006",
    timestampCreacion: minutesAgo(130),
    turno: "N",
    area: "Lixiviacion",
    subarea: "Pila 1",
    operador: "L. Castillo",
    estado: "Crítico",
    observacion: "Caida sostenida de flujo requiere revision.",
    flujoPLS: 980,
    acidezRefino: 6.6,
    cuPls: 4.7,
    nivelPiscinaRefino: 82,
    nivelPiscinaPLS: 72
  },
  {
    id: "demo-007",
    timestampCreacion: minutesAgo(168),
    turno: "B",
    area: "Lixiviacion",
    subarea: "Pila 2",
    operador: "S. Alvarez",
    estado: "Normal",
    observacion: "Riego conforme a plan.",
    flujoPLS: 1198,
    acidezRefino: 7.4,
    cuPls: 5.0,
    nivelPiscinaRefino: 81,
    nivelPiscinaPLS: 74
  },
  {
    id: "demo-008",
    timestampCreacion: minutesAgo(210),
    turno: "B",
    area: "Lixiviacion",
    subarea: "Pila 3",
    operador: "F. Herrera",
    estado: "Normal",
    observacion: "Distribucion balanceada.",
    flujoPLS: 1275,
    acidezRefino: 7.9,
    cuPls: 5.3,
    nivelPiscinaRefino: 79,
    nivelPiscinaPLS: 70
  }
];

export const demoProcess = [
  { name: "PLANTA", state: "Crítico", metric: "3.323 m3/h" },
  { name: "Pila 1", state: "Crítico", metric: "980 m3/h" },
  { name: "Pila 2", state: "Normal", metric: "1.198 m3/h" },
  { name: "Pila 3", state: "Alerta", metric: "1.145 m3/h" },
  { name: "Piscina PLS", state: "Alerta", metric: "58%" },
  { name: "Piscina Refino", state: "Normal", metric: "80%" }
];
