import React, { useEffect, useRef, useState } from 'react';
import { useLightMode } from '@/context/LightModeContext';

interface SnowflakeProps {
  enabled: boolean;
}

const Snowflakes: React.FC<SnowflakeProps> = ({ enabled: requested }) => {
  const { effectivePrefs } = useLightMode();
  const enabled = requested && effectivePrefs.bgAnimations;
  // Mouse position lives in a ref so updating it does NOT re-run the effect.
  // The previous implementation kept it in state and listed it as an effect
  // dependency, so every mouse move tore down + re-installed the listener and
  // the 50ms interval. With this change the effect only re-runs when `enabled`
  // flips. — perf
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const [snowflakes, setSnowflakes] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);

  useEffect(() => {
    if (!enabled) {
      setSnowflakes([]);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current.x = e.clientX;
      mousePositionRef.current.y = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const createSnowflake = () => {
      const id = Date.now();
      const size = Math.random() * 10 + 5;
      const { x, y } = mousePositionRef.current;
      setSnowflakes(prev => [...prev.slice(-50), {
        id,
        x,
        y,
        size
      }]);
    };

    const interval = setInterval(createSnowflake, 50);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearInterval(interval);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 pointer-events-none">
      {snowflakes.map((snowflake) => (
        <div
          key={snowflake.id}
          className="absolute text-white animate-fall"
          style={{
            left: `${snowflake.x}px`,
            top: `${snowflake.y}px`,
            fontSize: `${snowflake.size}px`,
            transition: 'all 1s linear',
            opacity: Math.random() * 0.5 + 0.5,
          }}
        >
          ❄
        </div>
      ))}
    </div>
  );
};

export default Snowflakes;
