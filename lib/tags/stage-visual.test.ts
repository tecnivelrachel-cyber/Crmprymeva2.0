import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stageIcon,
  stageColors,
  stageDescription,
  initialsOf,
  avatarColor,
  getStagePastelStyles,
  POST_SALE_FALLBACK_COLOR,
} from "./stage-visual";
import type { PipelineStage } from "@/types/database";

function stage(name: string, extra: Partial<PipelineStage> = {}): Pick<PipelineStage, "name" | "is_won" | "is_lost"> {
  return { name, is_won: false, is_lost: false, ...extra } as Pick<PipelineStage, "name" | "is_won" | "is_lost">;
}

test("ícone é escolhido pelas etapas reais do funil da TecNivel", () => {
  assert.equal(stageIcon(stage("Lead novo")), "user-plus");
  assert.equal(stageIcon(stage("Em qualificação")), "target");
  assert.equal(stageIcon(stage("Levantamento técnico")), "calculator");
  assert.equal(stageIcon(stage("Orçamento em elaboração")), "calculator");
  assert.equal(stageIcon(stage("Proposta enviada")), "file-up");
  assert.equal(stageIcon(stage("Negociação")), "handshake");
  assert.equal(stageIcon(stage("Aguardando decisão")), "clock");
});

test("is_won / is_lost têm prioridade sobre o nome", () => {
  assert.equal(stageIcon(stage("Fechado", { is_won: true })), "check-circle");
  assert.equal(stageIcon(stage("Perdido", { is_lost: true })), "circle-slash");
});

test("etapa desconhecida cai num ícone neutro, nunca quebra", () => {
  assert.equal(stageIcon(stage("Etapa personalizada da empresa")), "target");
});

test("etapas renomeadas pelo usuário ainda são reconhecidas por palavra-chave", () => {
  assert.equal(stageIcon(stage("Cliente quente")), "flame");
  assert.equal(stageIcon(stage("Follow-up semanal")), "rotate-ccw");
  assert.equal(stageIcon(stage("Contato iniciado")), "message-square");
});

test("stageColors deriva fundo, borda e texto da cor vinda do banco", () => {
  const colors = stageColors("#2E90FA");
  assert.equal(colors.solid, "rgb(46, 144, 250)");
  assert.ok(colors.background.startsWith("rgba(46, 144, 250"));
  assert.ok(colors.border.startsWith("rgba(46, 144, 250"));
  assert.ok(colors.text.startsWith("rgb("));
});

test("cor clara (amarelo) tem o texto escurecido para manter contraste", () => {
  const amarelo = stageColors("#F79009");
  const escuro = stageColors("#475467");
  // O fator de escurecimento é mais agressivo para cores claras.
  assert.notEqual(amarelo.text, amarelo.solid);
  assert.notEqual(escuro.text, escuro.solid);
});

test("cor inválida ou ausente cai no azul padrão em vez de quebrar", () => {
  assert.equal(stageColors(null).solid, "rgb(46, 144, 250)");
  assert.equal(stageColors("não-é-cor").solid, "rgb(46, 144, 250)");
  assert.equal(stageColors("").solid, "rgb(46, 144, 250)");
});

test("cor em formato curto (#abc) é aceita", () => {
  assert.equal(stageColors("#0f0").solid, "rgb(0, 255, 0)");
});

test("cor em formato rgb()/rgba() também é aceita", () => {
  assert.equal(stageColors("rgb(46, 144, 250)").solid, "rgb(46, 144, 250)");
  assert.equal(stageColors("rgba(46, 144, 250, 0.8)").solid, "rgb(46, 144, 250)");
});

test("getStagePastelStyles é a mesma derivação de stageColors (cabeçalho da conversa)", () => {
  assert.deepEqual(getStagePastelStyles("#12B76A"), stageColors("#12B76A"));
});

test("cabeçalho do Comercial sem etapa cai no azul pastel padrão da TecNível", () => {
  assert.equal(getStagePastelStyles(null).solid, "rgb(46, 144, 250)");
  assert.equal(getStagePastelStyles(undefined).solid, "rgb(46, 144, 250)");
});

test("cabeçalho do Pós-venda sem etapa/processo cai no laranja da marca, não no azul do Comercial", () => {
  const pastel = getStagePastelStyles(null, POST_SALE_FALLBACK_COLOR);
  assert.equal(pastel.solid, "rgb(244, 122, 39)");
  assert.notEqual(pastel.solid, stageColors(null).solid);
});

test("cor inválida no Pós-venda também cai no laranja, não no azul do Comercial", () => {
  const pastel = getStagePastelStyles("não-é-cor", POST_SALE_FALLBACK_COLOR);
  assert.equal(pastel.solid, "rgb(244, 122, 39)");
});

test("descrição curta acompanha a etapa", () => {
  assert.match(stageDescription(stage("Proposta enviada")), /Orçamento já apresentado/);
  assert.match(stageDescription(stage("Aguardando decisão")), /ainda não retornou/);
  assert.equal(stageDescription(stage("Etapa nova", { is_won: true })), "Negócio ganho.");
});

test("iniciais do avatar usam primeiro e último nome", () => {
  assert.equal(initialsOf("Carla Rocha"), "CR");
  assert.equal(initialsOf("João Pedro da Silva"), "JS");
  assert.equal(initialsOf("Auto Posto Central"), "AC");
});

test("iniciais lidam com nome único, vazio e espaços", () => {
  assert.equal(initialsOf("Rachel"), "R");
  assert.equal(initialsOf("   "), "?");
  assert.equal(initialsOf(null), "?");
  assert.equal(initialsOf(undefined), "?");
});

test("cor do avatar é estável para o mesmo nome", () => {
  assert.equal(avatarColor("Carla Rocha"), avatarColor("Carla Rocha"));
  assert.notEqual(avatarColor(""), undefined);
});
