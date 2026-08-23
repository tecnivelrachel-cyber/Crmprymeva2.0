"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { ensurePostSaleProcessForWonDeal } from "@/lib/pos-venda/auto-create";
import { dealSchema, type DealInput } from "@/lib/validation/schemas";

type ActionResult = { success?: true; id?: string; error?: string };

function toRow(data: DealInput) {
  return {
    title: data.title,
    contact_id: data.contact_id || null,
    stage_id: data.stage_id,
    assigned_user_id: data.assigned_user_id || null,
    estimated_value: data.estimated_value ?? 0,
    tank_quantity: data.tank_quantity ?? null,
    compartment_quantity: data.compartment_quantity ?? null,
    segment: data.segment || null,
    priority: data.priority,
    loss_reason: data.loss_reason || null,
  };
}

export async function createDealAction(input: DealInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "create_deals")) throw new Error("Você não tem permissão para criar negócios.");
    const data = dealSchema.parse(input);

    const supabase = await createClient();
    const { data: targetStage } = await supabase.from("pipeline_stages").select("is_won").eq("id", data.stage_id).maybeSingle();

    const { data: created, error } = await supabase
      .from("deals")
      .insert({ ...toRow(data), created_by: actor.id })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "deal.create", entityType: "deal", entityId: created.id });

    if (targetStage?.is_won) await ensurePostSaleProcessForWonDeal(supabase, created.id, actor.id);

    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/conversas");
    revalidatePath("/pos-venda");
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível criar o negócio.");
  }
}

export async function updateDealAction(id: string, input: DealInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "edit_deals")) throw new Error("Você não tem permissão para editar negócios.");
    const data = dealSchema.parse(input);

    const supabase = await createClient();
    const { data: targetStage } = await supabase.from("pipeline_stages").select("is_won").eq("id", data.stage_id).maybeSingle();

    const { error } = await supabase
      .from("deals")
      .update({ ...toRow(data), last_activity_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "deal.update", entityType: "deal", entityId: id });

    if (targetStage?.is_won) await ensurePostSaleProcessForWonDeal(supabase, id, actor.id);

    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/conversas");
    revalidatePath("/pos-venda");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar o negócio.");
  }
}

export async function moveDealAction(id: string, stageId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasAnyPermission(actor, ["move_deals", "edit_deals", "assign_deals"])) {
      throw new Error("Você não tem permissão para mover negócios.");
    }

    const supabase = await createClient();
    const { data: targetStage } = await supabase.from("pipeline_stages").select("is_won").eq("id", stageId).maybeSingle();

    const { error } = await supabase
      .from("deals")
      .update({ stage_id: stageId, last_activity_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: "deal.move",
      entityType: "deal",
      entityId: id,
      metadata: { stage_id: stageId },
    });

    if (targetStage?.is_won) await ensurePostSaleProcessForWonDeal(supabase, id, actor.id);

    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/conversas");
    revalidatePath("/pos-venda");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível mover o negócio.");
  }
}

export async function softDeleteDealAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_deals")) throw new Error("Você não tem permissão para excluir negócios.");

    const supabase = await createClient();
    const { error } = await supabase.from("deals").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "deal.delete", entityType: "deal", entityId: id });

    revalidatePath("/funil");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o negócio.");
  }
}
