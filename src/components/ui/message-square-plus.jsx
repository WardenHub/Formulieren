"use client";

import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

const PLUS_VARIANTS = {
  normal: {
    rotate: 0,
    scale: 1,
  },
  animate: {
    rotate: [0, 0, 90, 90, 0],
    scale: [1, 1, 1.08, 1.08, 1],
    transition: {
      duration: 0.9,
      times: [0, 0.2, 0.45, 0.7, 1],
    },
  },
};

const MessageSquarePlusIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h8" />
        <motion.g animate={controls} variants={PLUS_VARIANTS}>
          <path d="M16 3v8" />
          <path d="M12 7h8" />
        </motion.g>
      </svg>
    </div>
  );
});

MessageSquarePlusIcon.displayName = "MessageSquarePlusIcon";

export { MessageSquarePlusIcon };
