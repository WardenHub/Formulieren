// /src/components/ui/map-pinned.jsx

"use client";;
import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

// De tekening met de pins erop; hetzelfde beeld als de tab Tekeningen op het
// installatiescherm. Alleen de speld beweegt, het blad blijft liggen.
const PIN_VARIANTS = {
  normal: {
    translateY: 0,
    transition: { duration: 0.25, type: "spring", stiffness: 260, damping: 18 },
  },
  animate: {
    translateY: [-2, 0],
    transition: { duration: 0.45, type: "spring", stiffness: 260, damping: 12 },
  },
};

const MapPinnedIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback((e) => {
    if (isControlledRef.current) {
      onMouseEnter?.(e);
    } else {
      controls.start("animate");
    }
  }, [controls, onMouseEnter]);

  const handleMouseLeave = useCallback((e) => {
    if (isControlledRef.current) {
      onMouseLeave?.(e);
    } else {
      controls.start("normal");
    }
  }, [controls, onMouseLeave]);

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}>
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg">
        <path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712" />
        <motion.g animate={controls} initial="normal" variants={PIN_VARIANTS}>
          <path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0" />
          <circle cx="12" cy="8" r="2" />
        </motion.g>
      </svg>
    </div>
  );
});

MapPinnedIcon.displayName = "MapPinnedIcon";

export { MapPinnedIcon };
