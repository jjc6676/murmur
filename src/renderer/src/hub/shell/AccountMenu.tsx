// SCAFFOLD: replaced by the Home/Insights slice.
import type { ReactNode } from 'react';
import { Menu } from '../../ui';

export function AccountMenu({ trigger }: { trigger: (p: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode }) {
  return <Menu trigger={trigger} items={[]} align="start" />;
}
