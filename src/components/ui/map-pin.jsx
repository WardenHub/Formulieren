// /src/components/ui/map-pin.jsx

"use client";;
import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

// Een bestaande markering aanwijzen, niet er een plaatsen; daarvoor is
// map-pin-plus-inside. De speld wipt even op en valt terug, alsof hij naar de plek wijst.
const PIN_VARIANTS = {
  normal: {
    translateY: 0,
    transition: { duration: 0.25, type: "spring", stiffness: 260, damping: 18 },
  },
  animate: {
    translateY: [-3, 0],
    transition: { duration: 0.45, type: "spring", stiffness: 260, damping: 12 },
  },
};

const MapPinIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
        <motion.g animate={controls} initial="normal" variants={PIN_VARIANTS}>
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
          <circle cx="12" cy="10" r="3" />
        </motion.g>
      </svg>
    </div>
  );
});

MapPinIcon.displayName = "MapPinIcon";

export { MapPinIcon };
