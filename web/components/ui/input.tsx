"use client";

import * as React from "react";
import { groupAmountInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "well flex h-11 w-full rounded-md px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-[rgba(131,170,255,.55)] focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/** Grows with its content up to `maxHeight` px, then scrolls. Works with react-hook-form's register(). */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number }>(
  ({ className, maxHeight = 420, onInput, ...props }, ref) => {
    const inner = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => inner.current!);
    const resize = React.useCallback(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight + 2, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight + 2 > maxHeight ? "auto" : "hidden";
    }, [maxHeight]);
    React.useLayoutEffect(resize, [resize, props.value]);
    return (
      <textarea
        ref={inner}
        onInput={(e) => {
          resize();
          onInput?.(e);
        }}
        className={cn(
          "well flex min-h-24 w-full resize-none rounded-md px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground transition-[border-color] focus-visible:border-[rgba(131,170,255,.55)] focus-visible:outline-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

/** "123 / 5,000" next to a field label; amber near the limit, red at it. */
export function CharCount({ value, max }: { value?: string; max: number }) {
  const n = value?.length ?? 0;
  return (
    <span
      aria-live="polite"
      className={cn(
        "text-[0.68rem] tabular-nums text-muted-foreground",
        n >= max ? "text-destructive" : n >= max * 0.9 && "text-warning-fg",
      )}
    >
      {n.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
    </span>
  );
}

/**
 * Money input that groups thousands as you type ("10000000" → "10,000,000") and keeps the caret in place.
 * The value stays a string that parseUsdc6 / parseNativeWei accept.
 */
export const AmountInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
    value: string;
    onChange: (value: string) => void;
    decimals?: number;
    suffix?: string;
  }
>(({ value, onChange, decimals = 6, suffix = "USDC", className, ...props }, ref) => {
  const inner = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inner.current!);
  return (
    <div className="relative">
      <input
        ref={inner}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const el = e.target;
          // Remember how many digits sit before the caret, then put it back after the same digit.
          const caret = el.selectionStart ?? el.value.length;
          const before = el.value.slice(0, caret).replace(/[^\d.]/g, "").length;
          const next = groupAmountInput(el.value, decimals);
          onChange(next);
          requestAnimationFrame(() => {
            const input = inner.current;
            if (!input || document.activeElement !== input) return;
            let pos = 0;
            for (let seen = 0; pos < next.length && seen < before; pos++) if (/[\d.]/.test(next[pos])) seen++;
            input.setSelectionRange(pos, pos);
          });
        }}
        className={cn(
          "well flex h-11 w-full rounded-md py-2 pl-3.5 text-sm tabular-nums text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-[rgba(131,170,255,.55)] focus-visible:outline-none disabled:opacity-50",
          suffix ? "pr-16" : "pr-3.5",
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[0.72rem] font-medium text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
});
AmountInput.displayName = "AmountInput";


export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[0.78rem] font-medium leading-none text-foreground", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-destructive">{children}</p>;
}
