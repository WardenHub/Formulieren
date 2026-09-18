"use client";;
import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

// De krul tekent zichzelf; dat leest meteen als ondertekenen in plaats van bewerken.
const KRUL_VARIANTS = {
  normal: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.2 },
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0.3, 1],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
};

const LIJN_VARIANTS = {
  normal: { x: 0 },
  animate: {
    x: [0, 0.6, -0.6, 0],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
};

const SignatureIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
        style={{ overflow: "visible" }}
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg">
        <motion.path
          animate={controls}
          d="M3 15c2.2 0 2.4-8 4.3-8s1.1 8 3 8 2.4-5 3.9-5 1 3 2 3h1.8"
          initial="normal"
          variants={KRUL_VARIANTS} />
        <motion.path
          animate={controls}
          d="M4 20h16"
          initial="normal"
          variants={LIJN_VARIANTS} />
      </svg>
    </div>
  );
});

SignatureIcon.displayName = "SignatureIcon";

export { SignatureIcon };
