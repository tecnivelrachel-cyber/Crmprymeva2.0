"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProcessDialog, type EligibleQuote } from "./create-process-dialog";
import type { Contact, Deal, PostSaleStage, Profile } from "@/types/database";

interface AddProcessButtonProps {
  stages: PostSaleStage[];
  contacts: Pick<Contact, "id" | "full_name" | "company_name">[];
  quotes: EligibleQuote[];
  deals: Pick<Deal, "id" | "title">[];
  users: Pick<Profile, "id" | "full_name">[];
}

export function AddProcessButton({ stages, contacts, quotes, deals, users }: AddProcessButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Adicionar processo
      </Button>
      {open && (
        <CreateProcessDialog
          open
          onClose={() => setOpen(false)}
          stages={stages}
          contacts={contacts}
          quotes={quotes}
          deals={deals}
          users={users}
        />
      )}
    </>
  );
}
