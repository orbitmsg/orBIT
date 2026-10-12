import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw, FlipHorizontal } from 'lucide-react';

interface BannerCropperModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const CROP_BOX_WIDTH = 380;
const CROP_BOX_HEIGHT = 140;

export const BannerCropperModal: React.FC<BannerCropperModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imgNatural, setImgNatural] = useState({ width: 1, height: 1 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const isRotated90 = rotation % 180 !== 0;
  const effectiveNatW = isRotated90 ? imgNatural.height : imgNatural.width;
  const effectiveNatH = isRotated90 ? imgNatural.width : imgNatural.height;
  const coverScale = Math.max(CROP_BOX_WIDTH / effectiveNatW, CROP_BOX_HEIGHT / effectiveNatH);
  const baseWidth = imgNatural.width * coverScale;
  const baseHeight = imgNatural.height * coverScale;

  const clampPos = useCallback(
    (x: number, y: number, s: number, rot: number) => {
      const isRot = rot % 180 !== 0;
      const effW = (isRot ? baseHeight : baseWidth) * s;
      const effH = (isRot ? baseWidth : baseHeight) * s;
      const maxX = Math.max(0, (effW - CROP_BOX_WIDTH) / 2);
      const maxY = Math.max(0, (effH - CROP_BOX_HEIGHT) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [baseWidth, baseHeight]
  );

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsFlipped(false);
    }
  }, [isOpen, imageSrc]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImgNatural({ width: naturalWidth || 1, height: naturalHeight || 1 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newX = dragStartRef.current.posX + dx;
      const newY = dragStartRef.current.posY + dy;
      setPosition(clampPos(newX, newY, scale, rotation));
    },
    [isDragging, scale, rotation, clampPos]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.0025;
        setScale((prev) => {
          const next = Math.max(1.0, Math.min(5.0, prev + delta * prev));
          setPosition((pos) => clampPos(pos.x, pos.y, next, rotation));
          return next;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isOpen, clampPos, rotation]);

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setPosition((prev) => clampPos(prev.x, prev.y, scale, nextRot));
  };

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setIsFlipped(false);
  };

  const handleSaveCrop = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    const outputWidth = 800;
    const outputHeight = Math.round((outputWidth * CROP_BOX_HEIGHT) / CROP_BOX_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = outputWidth / CROP_BOX_WIDTH;
    const clamped = clampPos(position.x, position.y, scale, rotation);

    ctx.save();
    ctx.translate(outputWidth / 2, outputHeight / 2);
    ctx.translate(clamped.x * ratio, clamped.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(isFlipped ? -1 : 1, 1);
    ctx.scale(scale, scale);

    const drawW = baseWidth * ratio;
    const drawH = baseHeight * ratio;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onSave(dataUrl);
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '460px',
          maxWidth: '95vw',
          backgroundColor: 'var(--settings-bg, #211c2e)',
          borderRadius: '20px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main, #ffffff)' }}>
            {t('settings.crop_banner', 'Обрезка баннера')}
          </span>
          <button
            type="button"
            onClick={handleReset}
            aria-label={t('common.reset', 'Сбросить')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #7C3AED)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            {t('common.reset', 'Сбросить')}
          </button>
        </div>

        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'relative',
            width: `${CROP_BOX_WIDTH}px`,
            height: `${CROP_BOX_HEIGHT}px`,
            borderRadius: '14px',
            overflow: 'hidden',
            backgroundColor: '#000000',
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: '0 0 0 1.5px rgba(255,255,255,0.4)',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: `${baseWidth}px`,
              height: `${baseHeight}px`,
              left: `${(CROP_BOX_WIDTH - baseWidth) / 2}px`,
              top: `${(CROP_BOX_HEIGHT - baseHeight) / 2}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1}) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.05s ease-out',
              pointerEvents: 'none',
            }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              onLoad={handleImageLoad}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
              }}
            />
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim, #8e8e93)' }}>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={scale}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              setScale(next);
              setPosition((pos) => clampPos(pos.x, pos.y, next, rotation));
            }}
            aria-label="Zoom"
            style={{ flex: 1, accentColor: 'var(--accent-color, #7C3AED)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleRotate}
              aria-label={t('common.rotate', 'Повернуть')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-main, #ffffff)',
                cursor: 'pointer',
              }}
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              onClick={handleFlip}
              aria-label={t('common.flip', 'Отразить')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-main, #ffffff)',
                cursor: 'pointer',
              }}
            >
              <FlipHorizontal size={15} />
            </button>
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel', 'Отмена')}
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim, #8e8e93)',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 500,
            }}
          >
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            aria-label={t('common.save', 'Сохранить')}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              background: 'var(--accent-color, #7C3AED)',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 600,
            }}
          >
            {t('common.save', 'Сохранить')}
          </button>
        </div>
      </div>
    </div>
  );
};
