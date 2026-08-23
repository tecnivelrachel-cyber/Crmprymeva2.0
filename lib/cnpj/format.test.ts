import { describe, it, expect } from "vitest";
import { onlyDigits, maskCnpj, isValidCnpj } from "./format";

describe("onlyDigits", () => {
  it("remove tudo que não é número", () => {
    expect(onlyDigits("47.644.054/0001-53")).toBe("47644054000153");
  });
});

describe("maskCnpj", () => {
  it("aplica a máscara 00.000.000/0000-00", () => {
    expect(maskCnpj("47644054000153")).toBe("47.644.054/0001-53");
  });

  it("funciona com digitação parcial (incremental)", () => {
    expect(maskCnpj("47")).toBe("47");
    expect(maskCnpj("476")).toBe("47.6");
    expect(maskCnpj("47644054")).toBe("47.644.054");
    expect(maskCnpj("476440540001")).toBe("47.644.054/0001");
  });

  it("ignora dígitos além de 14", () => {
    expect(maskCnpj("476440540001539999")).toBe("47.644.054/0001-53");
  });
});

describe("isValidCnpj", () => {
  it("aceita um CNPJ real com dígito verificador correto (TecNível)", () => {
    expect(isValidCnpj("47644054000153")).toBe(true);
    expect(isValidCnpj("47.644.054/0001-53")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador errado", () => {
    expect(isValidCnpj("47644054000154")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("rejeita sequência de dígitos repetidos", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
  });
});
