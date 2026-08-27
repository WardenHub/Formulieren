"use client";

import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

const DOT_VARIANTS = {
  normal: { opacity: 1, scale: 1 },
  animate: (index) => ({
    opacity: [1, 0.25, 1],
    scale: [1, 1.5, 1],
    transition: { delay: index * 0.09, duration: 0.55, ease: "easeInOut" },
  }),
};
const AnimatedCircle = motion.circle;

const MessageSquareMoreIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
    <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
      <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        {[8, 12, 16].map((cx, index) => <AnimatedCircle key={cx} animate={controls} custom={index} cx={cx} cy="11" fill="currentColor" r=".7" stroke="none" variants={DOT_VARIANTS} />)}
      </svg>
    </div>
  );
});

MessageSquareMoreIcon.displayName = "MessageSquareMoreIcon";

export { MessageSquareMoreIcon };
