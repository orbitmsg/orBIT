import React from 'react';
import { OrbitIcon } from '../common/OrbitBrand';

interface OrbitaLogoProps {
  size?: number;
  className?: string;
}

export const OrbitaLogo: React.FC<OrbitaLogoProps> = ({ size = 40, className = '' }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <OrbitIcon size={size} />
    </div>
  );
};
