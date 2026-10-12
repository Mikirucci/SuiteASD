"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type Ref } from "react";
import { Input, type InputProps } from "@/components/ui/input";

type PasswordInputProps = Omit<InputProps, "type" | "trailing" | "leadingIcon"> & { ref?: Ref<HTMLInputElement> };

/** Password field with a show/hide toggle (a real button, announced as pressed). */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          aria-label={visible ? "Nascondi password" : "Mostra password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="inline-flex size-10 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-ink-100 hover:text-fg"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      }
    />
  );
}
