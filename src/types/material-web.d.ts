import type { MdLinearProgress } from '@material/web/progress/linear-progress.js';
import type { MdSlider } from '@material/web/slider/slider.js';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'md-linear-progress': React.DetailedHTMLProps<React.HTMLAttributes<MdLinearProgress>, MdLinearProgress> & {
        value?: number;
        max?: number;
        buffer?: number;
        indeterminate?: boolean;
        'four-color'?: boolean;
      };
      'md-slider': React.DetailedHTMLProps<React.HTMLAttributes<MdSlider>, MdSlider> & {
        min?: number;
        max?: number;
        value?: number;
        step?: number;
        ticks?: boolean;
        labeled?: boolean;
        disabled?: boolean;
      };
    }
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'md-linear-progress': React.DetailedHTMLProps<React.HTMLAttributes<MdLinearProgress>, MdLinearProgress> & {
        value?: number;
        max?: number;
        buffer?: number;
        indeterminate?: boolean;
        'four-color'?: boolean;
      };
      'md-slider': React.DetailedHTMLProps<React.HTMLAttributes<MdSlider>, MdSlider> & {
        min?: number;
        max?: number;
        value?: number;
        step?: number;
        ticks?: boolean;
        labeled?: boolean;
        disabled?: boolean;
      };
    }
  }
}

export {};
