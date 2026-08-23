"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { logPostSaleEvent } from "@/lib/pos-venda/events";
import { postSaleEquipmentSchema, type PostSaleEquipmentInput } from "@/lib/validation/schemas";

type ActionResult = { success?: true; id?: string; error?: string };

function toRow(data: PostSaleEquipmentInput) {
  return {
    quote_item_id: data.quote_item_id || null,
    name: data.name,
    model: data.model || null,
    serial_number: data.serial_number || null,
    quantity: data.quantity,
    status: data.status,
    notes: data.notes || null,
  };
}

export async function createEquipmentAction(processId: string, input: PostSaleEquipmentInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "edit_post_sale")) throw new Error("Você não tem permissão para adicionar equipamentos.");
    const data = postSaleEquipmentSchema.parse(input);

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("post_sale_equipments")
      .insert({ process_id: processId, ...toRow(data) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.equipment.create", entityType: "post_sale_equipment", entityId: created.id });
    await logPostSaleEvent({
      processId,
      eventType: "equipment_added",
      actorId: actor.id,
      description: `Equipamento "${data.name}" adicionado.`,
    });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível adicionar o equipamento.");
  }
}

export async function updateEquipmentAction(id: string, processId: string, input: PostSaleEquipmentInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "edit_post_sale")) throw new Error("Você não tem permissão para editar equipamentos.");
    const data = postSaleEquipmentSchema.parse(input);

    const supabase = await createClient();
    const { error } = await supabase.from("post_sale_equipments").update(toRow(data)).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.equipment.update", entityType: "post_sale_equipment", entityId: id });
    await logPostSaleEvent({
      processId,
      eventType: "equipment_changed",
      actorId: actor.id,
      description: `Equipamento "${data.name}" atualizado.`,
    });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível editar o equipamento.");
  }
}

export async function deleteEquipmentAction(id: string, processId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "edit_post_sale")) throw new Error("Você não tem permissão para remover equipamentos.");

    const supabase = await createClient();
    const { error } = await supabase.from("post_sale_equipments").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.equipment.delete", entityType: "post_sale_equipment", entityId: id });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível remover o equipamento.");
  }
}
