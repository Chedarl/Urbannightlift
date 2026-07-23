"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import type { UserRole, UserStatus } from "@prisma/client";

export interface UserItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";
const ROLES: UserRole[] = ["OWNER", "DISPATCHER", "RIDER", "SUPPORT"];

export function UsersManager({ users, currentUserId }: { users: UserItem[]; currentUserId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ fullName: string; email: string; phone: string; role: UserRole; password: string }>({
    fullName: "",
    email: "",
    phone: "",
    role: "DISPATCHER",
    password: "",
  });

  async function create() {
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("common.error"));
      return;
    }
    setCreating(false);
    setForm({ fullName: "", email: "", phone: "", role: "DISPATCHER", password: "" });
    startTransition(() => router.refresh());
  }

  async function toggleStatus(u: UserItem) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t("admin.users.title")}</h1>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> {t("admin.users.add")}
        </Button>
      </div>

      {creating && (
        <div className="grid gap-2 rounded-2xl border border-gold-400/30 bg-ink-900 p-4 sm:grid-cols-2">
          <input className={inputCls} placeholder={t("admin.users.name")} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className={inputCls} type="email" placeholder={t("admin.users.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.users.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`admin.users.roles.${r}`)}
              </option>
            ))}
          </select>
          <input className={inputCls} type="text" placeholder={t("admin.users.password")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {error && <p className="text-sm text-restricted sm:col-span-2">{error}</p>}
          <Button size="sm" className="sm:col-span-2" onClick={create} disabled={pending || !form.email || !form.password || !form.fullName}>
            {t("common.save")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.fullName}</span>
                <Badge tone="violet">{t(`admin.users.roles.${u.role}`)}</Badge>
                <Badge tone={u.status === "ACTIVE" ? "safe" : "restricted"}>
                  {u.status === "ACTIVE" ? t("admin.users.statusActive") : t("admin.users.statusSuspended")}
                </Badge>
              </div>
              <p className="text-xs text-mist-500">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
            </div>
            {u.id !== currentUserId && (
              <Button size="sm" variant="outline" onClick={() => toggleStatus(u)} disabled={pending}>
                {u.status === "ACTIVE" ? t("admin.users.suspend") : t("admin.users.reactivate")}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
