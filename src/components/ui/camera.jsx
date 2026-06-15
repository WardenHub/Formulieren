import * as React from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

const CameraIcon = React.forwardRef(({ className, ...props }, ref) => (
  <Camera ref={ref} className={cn("icon-lucide", className)} {...props} />
));

CameraIcon.displayName = "CameraIcon";

export { CameraIcon };
