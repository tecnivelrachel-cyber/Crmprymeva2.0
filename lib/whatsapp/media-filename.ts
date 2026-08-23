// eslint-disable-next-line no-control-regex -- objetivo do regex é justamente remover caracteres de controle (0x00-0x1f, 0x7f)
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const UNSAFE_CHARS = /["/\\<>:*?|\r\n]/g;

/**
 * Sanitiza um nome de arquivo só para EXIBIÇÃO/Content-Disposition — nunca é
 * usado para montar caminhos de storage (isso usa UUID/messageId, nunca o
 * nome original). Remove diretórios, caracteres de controle e caracteres que
 * poderiam quebrar cabeçalhos HTTP ou sugerir HTML/script. IDÊNTICO ao
 * arquivo src/media/filename.ts do projeto whatsapp-bridge — qualquer
 * alteração aqui precisa ser replicada lá.
 */
export function sanitizeFileName(name: string | null | undefined): string {
  if (!name) return "arquivo";
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(CONTROL_CHARS, "").replace(UNSAFE_CHARS, "_").trim();
  if (!cleaned) return "arquivo";
  return cleaned.slice(0, 150);
}
