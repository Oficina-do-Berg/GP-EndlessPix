import logoUrl from '../assets/gp-logo.png';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Logo colorido da marca, com o fundo quadriculado removido.
 */
export function BrandLogo({ size = 30, className = '' }: BrandLogoProps) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 object-contain select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
