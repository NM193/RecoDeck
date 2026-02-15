import { icons, type LucideIcon } from 'lucide-react';

export type IconName = keyof typeof icons;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.5,
  style
}: IconProps) {
  const LucideIcon = icons[name] as LucideIcon;

  if (!LucideIcon) {
    console.warn(`Icon "${name}" not found in Lucide icons`);
    return null;
  }

  return (
    <LucideIcon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{
        color: 'currentColor',
        verticalAlign: 'middle',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        ...style
      }}
      aria-hidden="true"
    />
  );
}
