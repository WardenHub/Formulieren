"use client";

import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

const PLUS_VARIANTS = {
  normal: { scale: 1, rotate: 0 },
  animate: {
    scale: [1, 1.28, 1],
    rotate: [0, 90, 0],
    transition: { duration: 0.65, ease: "easeInOut" },
  },
};
const AnimatedPath = motion.path;

const MapPinPlusInsideIcon = forwardRef(({ animate = false, onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useEffect(() => {
    if (animate) controls.start("animate");
  }, [animate, controls]);

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
        <path d="M20 10c0 5-5.5 10-8 12-2.5-2-8-7-8-12a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
        <AnimatedPath animate={controls} d="M12 8.5v3M10.5 10h3" style={{ transformOrigin: "12px 10px" }} variants={PLUS_VARIANTS} />
      </svg>
    </div>
  );
});

MapPinPlusInsideIcon.displayName = "MapPinPlusInsideIcon";

export { MapPinPlusInsideIcon };
