"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { loginAdmin } from "../../../lib/api";
import { setAdminToken } from "../../../lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const data = await loginAdmin({ email, password });
      setAdminToken(data.token);
      router.replace("/admin");
    } catch (loginError) {
      setError(loginError.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <section className="panel auth-panel">
        <div className="auth-brand">
          <span className="badge badge-soft">
            <ShieldCheck size={14} />
            <span>Secure Admin Access</span>
          </span>
          <h1>Sign In to Publish Fare Charts</h1>
          <p>Only authorized operator accounts can upload and activate new government fare datasets.</p>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="email" className="field-title">
              <Mail size={14} />
              <span>Admin Email</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@busvara.local"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password" className="field-title">
              <LockKeyhole size={14} />
              <span>Password</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button className="button button-primary" type="submit" disabled={loading}>
            <span>{loading ? "Verifying..." : "Login to Admin"}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {error ? <p className="state-text state-error">{error}</p> : null}
      </section>
    </div>
  );
}
