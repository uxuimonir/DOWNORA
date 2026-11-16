import {
  Accordion as AccordionPrimitive,
  AlertDialog as AlertDialogPrimitive,
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownPrimitive,
  Select as SelectPrimitive,
  Tabs as TabsPrimitive,
  ToggleGroup as ToggleGroupPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import { Check, ChevronDown, X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

const overlayClass =
  'fixed inset-0 z-50 bg-black/60 backdrop-blur-[3px] data-[state=open]:animate-fade-in';

// ─────────────────────────── Dialog ───────────────────────────

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-stage border border-line-strong bg-surface p-6 shadow-pop data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-md text-ink-muted hover:bg-raised hover:text-ink"
          aria-label="Close"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('pr-8 text-lg font-semibold tracking-normal', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('mt-2 text-sm text-ink-muted', className)} {...props} />;
}

// ──────────────── Sheet (navigation drawer on small screens) ────────────────

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  title,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'material fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[1.75rem] border-t border-white/8 shadow-pop pb-safe',
          'data-[state=open]:animate-sheet-up',
          className,
        )}
        {...props}
      >
        <span aria-hidden className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-white/25" />
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ───────────────────────── AlertDialog ─────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlayClass} />
        <AlertDialogPrimitive.Content className="material fixed top-1/2 left-1/2 z-50 w-[min(19rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.125rem] bg-[#232323]/85 text-center shadow-pop data-[state=open]:animate-pop-in">
          <div className="px-5 pt-5 pb-4">
            <AlertDialogPrimitive.Title className="font-sans text-[1.0625rem] font-semibold tracking-[-0.01em]">
              {title}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
              {description}
            </AlertDialogPrimitive.Description>
          </div>
          <div className="grid grid-cols-2 border-t border-white/10 text-[1.0625rem]">
            <AlertDialogPrimitive.Cancel className="h-11 border-r border-white/10 text-accent hover:bg-white/5">
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={cn('h-11 font-semibold hover:bg-white/5', destructive ? 'text-danger' : 'text-accent')}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

// ───────────────────────── DropdownMenu ─────────────────────────

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'material z-50 min-w-48 rounded-[0.875rem] border border-white/10 p-1 shadow-pop data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex h-9 pointer-coarse:h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none select-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
        destructive
          ? 'text-danger data-[highlighted]:bg-danger/12'
          : 'text-ink data-[highlighted]:bg-hover [&_svg]:text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn('my-1 h-px bg-line-strong', className)} {...props} />;
}

// ─────────────────────────── Select ───────────────────────────

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface SelectFieldProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectField<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...triggerProps
}: SelectFieldProps<T>) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <SelectPrimitive.Trigger
        className={cn(
          'flex h-10 pointer-coarse:h-11 w-full items-center justify-between gap-2 rounded-full border border-line bg-raised px-4 text-sm text-ink',
          'hover:bg-hover data-[state=open]:border-line-strong disabled:opacity-50',
          className,
        )}
        {...triggerProps}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-ink-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-line-strong bg-raised shadow-pop data-[state=open]:animate-pop-in"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center rounded-lg py-1.5 pr-8 pl-2.5 text-sm text-ink outline-none select-none data-[highlighted]:bg-hover"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check className="size-4 text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ──────────────────────────── Tabs ────────────────────────────

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex h-10 items-center gap-1 rounded-full border border-line bg-surface p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium text-ink-muted transition-colors',
        'hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-canvas',
        '[&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;

// ─────────────────────── SegmentedControl ───────────────────────

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  'aria-label': string;
  className?: string;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'md',
  ...props
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn('inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1', className)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          className={cn(
            'hit-area inline-flex min-w-9 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium text-ink-muted transition-colors',
            'hover:text-ink data-[state=on]:bg-ink data-[state=on]:text-canvas data-[state=on]:shadow-[0_3px_8px_rgb(0_0_0/0.25)]',
            '[&_svg]:size-4',
            size === 'sm' ? 'h-7 pointer-coarse:h-9 text-xs' : 'h-8 pointer-coarse:h-10',
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

// ────────────────────────── Tooltip ──────────────────────────

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-xs text-ink shadow-pop data-[state=delayed-open]:animate-pop-in"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ───────────────────────── Accordion ─────────────────────────

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={cn('border-b border-line last:border-b-0', className)} {...props} />;
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header asChild>
      <h3 className="font-sans tracking-normal [font-variation-settings:normal]">
        <AccordionPrimitive.Trigger
          className={cn(
            'group flex w-full items-center justify-between gap-4 py-4 text-left text-[0.9375rem] font-medium text-ink hover:text-accent',
            className,
          )}
          {...props}
        >
          {children}
          <ChevronDown className="size-4 shrink-0 text-ink-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </AccordionPrimitive.Trigger>
      </h3>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn('max-w-[68ch] pb-5 text-sm leading-relaxed text-ink-muted', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
