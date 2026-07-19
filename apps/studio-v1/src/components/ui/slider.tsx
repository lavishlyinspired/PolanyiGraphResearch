import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: SliderPrimitive.SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className="absolute h-full bg-emerald-600" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-emerald-600 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
    </SliderPrimitive.Root>
  );
}
