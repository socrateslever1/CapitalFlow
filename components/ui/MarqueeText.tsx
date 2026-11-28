import React, { useLayoutEffect, useRef, useState } from 'react';

type Props = {
  text: string;
  className?: string;
};

/**
 * Texto de uma linha que, quando não cabe, desliza devagar até o fim e volta, com pausa nas pontas.
 * Quando cabe, fica parado. Com "reduzir movimento" ligado, mostra reticências como antes.
 */
export const MarqueeText: React.FC<Props> = ({ text, className = '' }) => {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      const inner = textRef.current;
      if (!box || !inner) return;
      const overflow = inner.scrollWidth - box.clientWidth;
      setShift(overflow > 1 ? overflow + 2 : 0);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (boxRef.current) observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [text]);

  const moving = shift > 0;
  return (
    <span ref={boxRef} title={moving ? text : undefined}
      className={`block min-w-0 overflow-hidden whitespace-nowrap ${moving ? 'text-left' : ''} ${className}`}>
      <span ref={textRef}
        className={`inline-block ${moving ? 'cf-marquee-run motion-reduce:max-w-full motion-reduce:truncate' : ''}`}
        style={moving ? ({
          '--cf-marquee-shift': `-${shift}px`,
          '--cf-marquee-duration': `${Math.min(12, Math.max(5, 3 + shift / 12))}s`,
        } as React.CSSProperties) : undefined}>
        {text}
      </span>
    </span>
  );
};
