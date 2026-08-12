"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions/auth";
import { DEMO_PERSONAS } from "@/lib/constants";

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null as { error?: string } | null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <form action={action}>
        <div className="field">
          <label>Work email</label>
          <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>
        {state?.error ? <div className="alert bad" style={{ marginBottom: 14 }}>{state.error}</div> : null}
        <button className="btn primary" style={{ width: "100%" }} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="demo-box">
        <div className="dl">Demo accounts · password: <code>demo1234</code></div>
        {DEMO_PERSONAS.map((d) => (
          <div className="demo-row" key={d.email}>
            <code>{d.email}</code>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => { setEmail(d.email); setPassword("demo1234"); }}
            >
              Use {d.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
