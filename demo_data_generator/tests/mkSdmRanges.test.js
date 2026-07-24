import test from "node:test";
import assert from "node:assert/strict";
import { generateDryRunCycle } from "../../plantview-admin/modules/mkSdmGenerator.js";
import { RANGES } from "../../plantview-admin/modules/mkSdmRanges.js";

test("generador respeta rangos en 1000 ciclos", () => {
  for (let i = 0; i < 1000; i++) {
    const records = generateDryRunCycle();
    assert.equal(records.length, 3, `Ciclo ${i + 1}: debe generar 3 registros`);
    for (const record of records) {
      for (const [campo, rango] of Object.entries(RANGES)) {
        const valor = record[campo];
        assert.ok(
          typeof valor === "number" && valor >= rango.min && valor <= rango.max,
          `Ciclo ${i + 1}, pila ${record.pila}: ${campo}=${valor} fuera de [${rango.min}, ${rango.max}]`
        );
      }
    }
  }
});
