"use client";

import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

const CameraIcon = forwardRef(({ className, size = 28, onMouseEnter, onMouseLeave, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;
    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback((event) => {
    if (isControlledRef.current) onMouseEnter?.(event);
    else controls.start("animate");
  }, [controls, onMouseEnter]);

  const handleMouseLeave = useCallback((event) => {
    if (isControlledRef.current) onMouseLeave?.(event);
    else controls.start("normal");
  }, [controls, onMouseLeave]);

  return (
    <div className={cn("icon-lucide", className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
      <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
        <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2z" />
        <motion.circle
          animate={controls}
          cx="12"
          cy="13"
          r="3"
          variants={{
            normal: { scale: 1 },
            animate: { scale: [1, 0.72, 1.08, 1], transition: { duration: 0.55, ease: "easeInOut" } },
          }}
          style={{ transformOrigin: "12px 13px" }}
        />
      </svg>
    </div>
  );
});

CameraIcon.displayName = "CameraIcon";

export { CameraIcon };
