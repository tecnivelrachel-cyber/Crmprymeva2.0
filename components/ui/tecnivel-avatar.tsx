import Image from "next/image";

interface TecNivelAvatarProps {
  photoUrl?: string | null;
  customerName: string;
  size?: number;
  className?: string;
}

/**
 * Avatar padrão de contatos do WhatsApp (Comercial e Pós-venda): mostra a
 * foto real do cliente quando existir; caso contrário, o mascote oficial da
 * TecNível — nunca iniciais genéricas. O mascote é um asset local
 * (public/brand/mascote-tecnivel-mascote.png) servido pelo next/image, que já
 * cuida de cache HTTP/otimização — sem requisições repetidas após o primeiro
 * carregamento.
 */
export function TecNivelAvatar({ photoUrl, customerName, size = 40, className }: TecNivelAvatarProps) {
  const hasPhoto = Boolean(photoUrl && photoUrl.trim() !== "");

  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-muted ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={hasPhoto ? (photoUrl as string) : "/brand/mascote-tecnivel-mascote.png"}
        alt={hasPhoto ? customerName : "TecNível"}
        fill
        sizes={`${size}px`}
        className="object-cover object-center"
      />
    </span>
  );
}
