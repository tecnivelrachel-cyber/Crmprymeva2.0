import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPurpose, managePermissionFor, buildConfig, isAbortOrNetworkError, unavailableBridgeStatus, errorBridgeStatus } from "./bridge-config";

test("isValidPurpose aceita só 'commercial' e 'post_sale'", () => {
  assert.equal(isValidPurpose("commercial"), true);
  assert.equal(isValidPurpose("post_sale"), true);
  assert.equal(isValidPurpose("outro"), false);
  assert.equal(isValidPurpose(null), false);
  assert.equal(isValidPurpose(""), false);
});

test("managePermissionFor nunca mistura propósito", () => {
  assert.equal(managePermissionFor("commercial"), "manage_whatsapp");
  assert.equal(managePermissionFor("post_sale"), "manage_post_sale_whatsapp");
});

test("buildConfig: linha commercial usa WHATSAPP_BRIDGE_COMMERCIAL_API_KEY, nunca a de post_sale", () => {
  const originalCommercial = process.env.WHATSAPP_BRIDGE_COMMERCIAL_API_KEY;
  const originalPostSale = process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY;
  process.env.WHATSAPP_BRIDGE_COMMERCIAL_API_KEY = "commercial-key";
  process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY = "post-sale-key";

  const config = buildConfig({ id: "acc-1", purpose: "commercial", bridge_url: "https://commercial.example.com" });
  assert.equal(config?.apiKey, "commercial-key");
  assert.equal(config?.bridgeUrl, "https://commercial.example.com");
  assert.notEqual(config?.apiKey, "post-sale-key");

  process.env.WHATSAPP_BRIDGE_COMMERCIAL_API_KEY = originalCommercial;
  process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY = originalPostSale;
});

test("buildConfig: linha post_sale usa WHATSAPP_BRIDGE_POST_SALE_API_KEY, nunca a comercial", () => {
  const originalCommercial = process.env.WHATSAPP_BRIDGE_COMMERCIAL_API_KEY;
  const originalPostSale = process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY;
  process.env.WHATSAPP_BRIDGE_COMMERCIAL_API_KEY = "commercial-key";
  process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY = "post-sale-key";

  const config = buildConfig({ id: "acc-2", purpose: "post_sale", bridge_url: "https://posvenda.example.com" });
  assert.equal(config?.apiKey, "post-sale-key");
  assert.notEqual(config?.apiKey, "commercial-key");

  process.env.WHATSAPP_BRIDGE_COMMERCIAL_API_KEY = originalCommercial;
  process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY = originalPostSale;
});

test("buildConfig: sem bridge_url retorna null (nunca cai para outra instância)", () => {
  const config = buildConfig({ id: "acc-3", purpose: "commercial", bridge_url: null });
  assert.equal(config, null);
});

test("buildConfig: sem a chave de API daquele propósito específico retorna null", () => {
  const original = process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY;
  delete process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY;

  const config = buildConfig({ id: "acc-4", purpose: "post_sale", bridge_url: "https://posvenda.example.com" });
  assert.equal(config, null);

  process.env.WHATSAPP_BRIDGE_POST_SALE_API_KEY = original;
});

test("buildConfig: purpose desconhecido retorna null", () => {
  const config = buildConfig({ id: "acc-5", purpose: "outro", bridge_url: "https://example.com" });
  assert.equal(config, null);
});

test("isAbortOrNetworkError: reconhece AbortError (timeout do AbortController)", () => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  assert.equal(isAbortOrNetworkError(err), true);
});

test("isAbortOrNetworkError: reconhece TypeError (falha de rede — DNS, conexão recusada)", () => {
  assert.equal(isAbortOrNetworkError(new TypeError("fetch failed")), true);
});

test("isAbortOrNetworkError: não reconhece um erro de aplicação comum", () => {
  assert.equal(isAbortOrNetworkError(new Error("HTTP 500")), false);
  assert.equal(isAbortOrNetworkError("string qualquer"), false);
  assert.equal(isAbortOrNetworkError(null), false);
});

test("unavailableBridgeStatus: status='unavailable', nunca 'connected' por engano, todos os campos nulos exceto lastError", () => {
  const status = unavailableBridgeStatus("Bridge indisponível ou demorou para responder.");
  assert.equal(status.status, "unavailable");
  assert.equal(status.connectedNumber, null);
  assert.equal(status.deviceName, null);
  assert.equal(status.connectedAt, null);
  assert.equal(status.lastMessageAt, null);
  assert.equal(status.lastError, "Bridge indisponível ou demorou para responder.");
});

test("errorBridgeStatus: status='error', distinto de 'unavailable'", () => {
  const status = errorBridgeStatus("Não foi possível consultar o status do WhatsApp.");
  assert.equal(status.status, "error");
  assert.notEqual(status.status, "unavailable");
});
