"use client";
import { DropdownMenu as Primitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) => (
  <Primitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
);

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lg",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4",
        destructive && "text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenuLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Label>) => (
  <Primitive.Label
    className={cn("px-3 py-1.5 text-xs font-semibold text-muted-foreground", className)}
    {...props}
  />
);
