"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteProcessDialog } from "@/components/pos-venda/delete-process-dialog";

export function ProcessDeleteButton({ processId }: { processId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="text-danger hover:bg-red-50">
        <Flame size={14} /> Excluir permanentemente
      </Button>
      <DeleteProcessDialog
        processId={processId}
        open={open}
        onClose={() => setOpen(false)}
        onDeleted={() => {
          setOpen(false);
          router.push("/pos-venda");
          router.refresh();
        }}
      />
    </>
  );
}
