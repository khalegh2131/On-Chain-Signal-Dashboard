'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Off-canvas panel built on the dialog primitive.
 *
 * Reuses the dialog's focus trap, `Escape` handling, and scroll lock rather than
 * reimplementing a drawer: those are the parts of an overlay that are easy to get
 * subtly wrong, and they are the parts a keyboard user depends on.
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SIDE_CLASSES = {
  left: 'inset-y-0 left-0 h-full w-4/5 max-w-xs border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  right:
    'inset-y-0 right-0 h-full w-4/5 max-w-xs border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom:
    'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
} as const;

export interface SheetContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  side?: keyof typeof SIDE_CLASSES;
  /** Accessible name for the panel; rendered as a visually hidden title. */
  title: string;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = 'left', title, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 gap-4 bg-background p-5 shadow-lg transition ease-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out',
        SIDE_CLASSES[side],
        className
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Close menu"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export { Sheet, SheetClose, SheetContent, SheetOverlay, SheetPortal, SheetTrigger };
