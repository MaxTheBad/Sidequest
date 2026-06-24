"use client";

import { useEffect, useId, useState } from "react";

type AntiAbuseGateProps = {
  label?: string;
  helpText?: string;
  required?: boolean;
  onChange?: (state: { honeypot: string; startedAt: number; captchaToken: string }) => void;
};

export function AntiAbuseGate({ label = "Anti-spam check", helpText = "This helps reduce bot abuse on sensitive actions.", required = true, onChange }: AntiAbuseGateProps) {
  const id = useId();
  const [honeypot, setHoneypot] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    onChange?.({ honeypot, startedAt, captchaToken });
  }, [captchaToken, honeypot, onChange, startedAt]);

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          className="mt-1"
          checked
          readOnly
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium text-slate-800">
            {label}{required ? " *" : ""}
          </label>
          <p className="text-xs text-slate-600">{helpText}</p>
        </div>
      </div>

      <input
        type="text"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px opacity-0"
        placeholder="Leave this field empty"
      />

      <label className="grid gap-1 text-xs text-slate-600">
        CAPTCHA token
        <input
          type="text"
          value={captchaToken}
          onChange={(e) => setCaptchaToken(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Paste token if CAPTCHA is enabled"
          required={required}
        />
      </label>
    </div>
  );
}
