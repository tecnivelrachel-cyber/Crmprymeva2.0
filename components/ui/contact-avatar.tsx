import Image from "next/image";

interface ContactAvatarProps {
  photoUrl?: string | null;
  customerName: string;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Avatar padrão de contatos (Comercial e Pós-venda): mostra a foto real do
 * cliente quando existir; caso contrário, as iniciais do nome sobre um
 * degradê da identidade Prymeva — nunca uma mascote de marca, para que o
 * produto fique neutro em qualquer segmento que o compre.
 */
export function ContactAvatar({ photoUrl, customerName, size = 40, className }: ContactAvatarProps) {
  const hasPhoto = Boolean(photoUrl && photoUrl.trim() !== "");

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-navy-600 to-accent-500 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {hasPhoto ? (
        <Image src={photoUrl as string} alt={customerName} fill sizes={`${size}px`} className="object-cover object-center" />
      ) : (
        <span className="font-semibold text-white" style={{ fontSize: Math.max(10, size * 0.38) }}>
          {initials(customerName)}
        </span>
      )}
    </span>
  );
}
