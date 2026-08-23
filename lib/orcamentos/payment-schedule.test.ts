import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  distributeInstallments,
  redistributeRemainingBalance,
  calculateInstallmentDifference,
  installmentsMatchTotal,
  buildDueDates,
  buildInstallmentSchedule,
  applyTotalToSchedule,
  resetScheduleToAutomatic,
  defaultInstallmentDescription,
  parseCurrencyInput,
  formatCurrencyInput,
} from "./payment-schedule";

describe("distributeInstallments — 1x a 12x", () => {
  it("1x: parcela única leva 100% do total", () => {
    assert.deepEqual(distributeInstallments(10000, 1), [10000]);
  });

  it("2x: divide igualmente quando é exato", () => {
    assert.deepEqual(distributeInstallments(10000, 2), [5000, 5000]);
  });

  it("3x: última parcela absorve o centavo de arredondamento (R$ 10.000,00 / 3)", () => {
    const result = distributeInstallments(10000, 3);
    assert.deepEqual(result, [3333.33, 3333.33, 3333.34]);
    assert.equal(result.reduce((a, b) => a + b, 0).toFixed(2), "10000.00");
  });

  it("5x: soma bate exatamente com o total", () => {
    const result = distributeInstallments(10000, 5);
    assert.equal(result.length, 5);
    assert.ok(installmentsMatchTotal(result, 10000));
  });

  it("12x: soma bate exatamente com o total", () => {
    const result = distributeInstallments(10000, 12);
    assert.equal(result.length, 12);
    assert.ok(installmentsMatchTotal(result, 10000));
  });
});

describe("defaultInstallmentDescription", () => {
  it("parcela 1 = Referente ao pedido", () => {
    assert.equal(defaultInstallmentDescription(0, 5), "Referente ao pedido");
  });
  it("parcela 2 = Referente à entrega", () => {
    assert.equal(defaultInstallmentDescription(1, 5), "Referente à entrega");
  });
  it("parcelas seguintes = 'Parcela N de X'", () => {
    assert.equal(defaultInstallmentDescription(2, 5), "Parcela 3 de 5");
    assert.equal(defaultInstallmentDescription(4, 5), "Parcela 5 de 5");
  });
});

describe("redistributeRemainingBalance — parcela manual", () => {
  it("parcela 1 manual: redistribui o saldo só entre as automáticas restantes", () => {
    // Total 20.000, 5x, P1=5.000 (manual), P2=7.000 (manual) -> saldo 8.000 entre P3/P4/P5
    const result = redistributeRemainingBalance(20000, [5000, 7000, null, null, null]);
    assert.equal(result[0], 5000);
    assert.equal(result[1], 7000);
    assert.deepEqual([result[2], result[3], result[4]], [2666.66, 2666.66, 2666.68]);
    assert.ok(installmentsMatchTotal(result, 20000));
  });

  it("parcela 2 manual isolada: só ela fica fixa, resto redistribui", () => {
    const result = redistributeRemainingBalance(9000, [null, 3000, null]);
    assert.equal(result[1], 3000);
    assert.equal(result[0]! + result[2]!, 6000);
  });

  it("parcela posterior (3+) manual: exclui do saldo a redistribuir", () => {
    // 4x de 8.000, P3 travada em 1.000 manualmente -> resto (7.000) entre P1,P2,P4
    const result = redistributeRemainingBalance(8000, [null, null, 1000, null]);
    assert.equal(result[2], 1000);
    assert.ok(installmentsMatchTotal(result, 8000));
  });

  it("nenhuma manual: equivalente a distribuir tudo automaticamente", () => {
    const result = redistributeRemainingBalance(10000, [null, null, null]);
    assert.deepEqual(result, distributeInstallments(10000, 3));
  });
});

describe("calculateInstallmentDifference / installmentsMatchTotal — soma exata e divergência", () => {
  it("soma exata: diferença zero, considerado conferido", () => {
    assert.equal(calculateInstallmentDifference([5000, 5000], 10000), 0);
    assert.ok(installmentsMatchTotal([5000, 5000], 10000));
  });

  it("divergência: diferença reportada corretamente, não é considerado conferido", () => {
    assert.equal(calculateInstallmentDifference([5000, 4000], 10000), -1000);
    assert.ok(!installmentsMatchTotal([5000, 4000], 10000));
  });

  it("tolerância de meio centavo (arredondamento em cascata) não conta como divergência", () => {
    assert.ok(installmentsMatchTotal([3333.33, 3333.33, 3333.34], 10000));
  });
});

describe("buildDueDates — datas e 'Na entrega'", () => {
  it("parcelas seguem cadência mensal a partir da parcela 1", () => {
    const dates = buildDueDates("2026-01-15", 3, false);
    assert.deepEqual(dates, ["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("parcela 2 'Na entrega': due_date fica null só nela", () => {
    const dates = buildDueDates("2026-01-15", 3, true);
    assert.equal(dates[0], "2026-01-15");
    assert.equal(dates[1], null);
    assert.equal(dates[2], "2026-03-15");
  });
});

describe("buildInstallmentSchedule — geração automática ao trocar quantidade", () => {
  it("1x gera uma parcela com 100% do total e descrição 'Referente ao pedido'", () => {
    const schedule = buildInstallmentSchedule(10000, 1, "boleto", "2026-01-15", false);
    assert.equal(schedule.length, 1);
    assert.equal(schedule[0]!.amount, 10000);
    assert.equal(schedule[0]!.description, "Referente ao pedido");
    assert.equal(schedule[0]!.mode, "auto");
  });

  it("5x gera 5 parcelas automáticas com descrições corretas", () => {
    const schedule = buildInstallmentSchedule(10000, 5, "pix", "2026-01-15", false);
    assert.equal(schedule.length, 5);
    assert.equal(schedule[0]!.description, "Referente ao pedido");
    assert.equal(schedule[1]!.description, "Referente à entrega");
    assert.equal(schedule[2]!.description, "Parcela 3 de 5");
    assert.ok(schedule.every((p) => p.mode === "auto"));
    assert.ok(installmentsMatchTotal(schedule.map((p) => p.amount), 10000));
  });
});

describe("applyTotalToSchedule — alteração do total (item/desconto/frete)", () => {
  it("preserva parcelas manuais e redistribui só as automáticas quando o total muda", () => {
    const schedule = buildInstallmentSchedule(10000, 3, "boleto", "2026-01-15", false);
    const manual = schedule.map((p, i) => (i === 0 ? { ...p, amount: 4000, mode: "manual" as const } : p));
    const updated = applyTotalToSchedule(manual, 12000);
    assert.equal(updated[0]!.amount, 4000);
    assert.ok(installmentsMatchTotal(updated.map((p) => p.amount), 12000));
  });
});

describe("resetScheduleToAutomatic — recalcular parcelas automaticamente", () => {
  it("preserva as duas primeiras e volta as demais para automático, redistribuindo", () => {
    const schedule = buildInstallmentSchedule(9000, 4, "boleto", "2026-01-15", false).map((p, i) =>
      i >= 2 ? { ...p, amount: 500, mode: "manual" as const } : p
    );
    const reset = resetScheduleToAutomatic(schedule, 9000, true);
    assert.equal(reset[0]!.amount, schedule[0]!.amount);
    assert.equal(reset[1]!.amount, schedule[1]!.amount);
    assert.ok(reset.slice(2).every((p) => p.mode === "auto"));
    assert.ok(installmentsMatchTotal(reset.map((p) => p.amount), 9000));
  });
});

describe("parseCurrencyInput / formatCurrencyInput — CurrencyInput", () => {
  it("aceita '14146,40', '14146.40', '14.146,40' e 'R$ 14.146,40' com o mesmo resultado", () => {
    assert.equal(parseCurrencyInput("14146,40"), 14146.4);
    assert.equal(parseCurrencyInput("14146.40"), 14146.4);
    assert.equal(parseCurrencyInput("14.146,40"), 14146.4);
    assert.equal(parseCurrencyInput("R$ 14.146,40"), 14146.4);
  });

  it("sequência pura de dígitos é tratada como centavos, nunca como reais diretamente", () => {
    assert.equal(parseCurrencyInput("01414640"), 14146.4);
    assert.notEqual(parseCurrencyInput("01414640"), 1414640);
  });

  it("nunca fica preso em zero inicial: string vazia vira 0, e 0 formata normalmente", () => {
    assert.equal(parseCurrencyInput(""), 0);
    assert.equal(formatCurrencyInput(0), "R$ 0,00");
  });

  it("formata sempre como R$ x.xxx,xx", () => {
    assert.equal(formatCurrencyInput(14146.4), "R$ 14.146,40");
  });
});
