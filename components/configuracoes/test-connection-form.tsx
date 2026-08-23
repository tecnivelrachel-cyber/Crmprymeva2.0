"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { testWhatsappConfigAction } from "@/app/(crm)/configuracoes/whatsapp/actions";

export function TestConnectionForm() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTest() {
    setLoading(true);
    setResult(null);
    const res = await testWhatsappConfigAction(phone);
    setLoading(false);
    if (res.error) {
      setResult({ ok: false, message: res.error });
      return;
    }
    setResult({
      ok: true,
      message: res.mocked
        ? "Envio simulado com sucesso (modo mock — nenhuma mensagem real foi enviada)."
        : "Mensagem de teste enviada com sucesso.",
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="test-phone">Número para teste</Label>
        <Input id="test-phone" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <Button type="button" onClick={handleTest} disabled={loading || !phone}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        Testar configuração
      </Button>
      {result && <p className={`text-sm ${result.ok ? "text-success" : "text-danger"}`}>{result.message}</p>}
    </div>
  );
}
