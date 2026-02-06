"use client";;
import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

const PATH_VARIANTS = {
  normal: { d: "M6 9h6V5l7 7-7 7v-4H6V9z", translateX: 0 },
  animate: {
    d: "M6 9h6V5l7 7-7 7v-4H6V9z",
    translateX: [0, 3, 0],
    transition: {
      duration: 0.4,
    },
  },
};

const ArrowBigRightIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
        <motion.path animate={controls} d="M6 9h6V5l7 7-7 7v-4H6V9z" variants={PATH_VARIANTS} />
      </svg>
    </div>
  );
});

ArrowBigRightIcon.displayName = "ArrowBigRightIcon";

export { ArrowBigRightIcon };
