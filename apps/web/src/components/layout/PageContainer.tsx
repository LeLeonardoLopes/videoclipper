import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const maxWidths = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
};

export function PageContainer({ children, maxWidth = 'lg' }: PageContainerProps) {
  return (
    <div className={`${maxWidths[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8 py-8`}>
      {children}
    </div>
  );
}
