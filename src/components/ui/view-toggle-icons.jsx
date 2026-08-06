"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const MotionSvg = motion.svg;
const MotionPath = motion.path;
const MotionRect = motion.rect;

const listLineVariants = (index) => ({
  rest: { x: 0 },
  hover: {
    x: index % 2 === 0 ? 2 : -2,
    transition: { duration: 0.18, delay: index * 0.035 },
  },
});

const gridCellVariants = (index) => ({
  rest: { scale: 1, opacity: 1 },
  hover: {
    scale: index === 3 ? 0.82 : 1.08,
    opacity: index === 3 ? 0.78 : 1,
    transition: { duration: 0.18, delay: index * 0.035 },
  },
});

function LayoutListIcon({ className, size = 28, ...props }) {
  return (
    <MotionSvg
      className={cn(className)}
      fill="none"
      height={size}
      initial="rest"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      whileHover="hover"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {[5, 12, 19].map((y, index) => (
        <MotionPath key={y} d={`M8 ${y}h12M4 ${y}h.01`} variants={listLineVariants(index)} />
      ))}
    </MotionSvg>
  );
}

function LayoutGridIcon({ className, size = 28, ...props }) {
  return (
    <MotionSvg
      className={cn(className)}
      fill="none"
      height={size}
      initial="rest"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      whileHover="hover"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {[
        [4, 4],
        [13, 4],
        [4, 13],
        [13, 13],
      ].map(([x, y], index) => (
        <MotionRect
          key={`${x}-${y}`}
          height="7"
          rx="1"
          variants={gridCellVariants(index)}
          width="7"
          x={x}
          y={y}
        />
      ))}
    </MotionSvg>
  );
}

export { LayoutGridIcon, LayoutListIcon };
