"use client";

import { useActionState } from "react";
import { refreshScores } from "@/lib/actions/admin";
import type { AdminState } from "@/lib/actions/admin";
import { Button } from "../ui/Button";

export function RefreshScoresButton() {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    async () => refreshScores(),
    { ok: false },
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        Skorları yeniden hesapla
      </Button>
      {state.ok && state.message && (
        <span role="status" className="text-2xs text-teal-700">{state.message}</span>
      )}
      {state.error && <span role="alert" className="text-2xs text-[#9f1239]">{state.error}</span>}
    </form>
  );
}
