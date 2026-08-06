"use client";
import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle } from "react";

import { cn } from "@/lib/utils";

const PlusIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();

  useImperativeHandle(ref, () => ({
    startAnimation: () => controls.start("animate"),
    stopAnimation: () => controls.start("normal"),
  }), [controls]);

  const handleMouseEnter = useCallback((e) => {
    controls.start("animate");
    onMouseEnter?.(e);
  }, [controls, onMouseEnter]);

  const handleMouseLeave = useCallback((e) => {
    controls.start("normal");
    onMouseLeave?.(e);
  }, [controls, onMouseLeave]);

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}>
      <motion.svg
        animate={controls}
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        variants={{
          normal: {
            rotate: 0,
          },
          animate: {
            rotate: 180,
          },
        }}
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg">
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </motion.svg>
    </div>
  );
});

PlusIcon.displayName = "PlusIcon";

export { PlusIcon };
