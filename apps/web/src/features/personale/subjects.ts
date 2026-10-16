"use client";

import { useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";

/** A person the signed-in user looks after in the personal area: themselves as an athlete, or one of their children. */
export interface Subject {
  memberId: string;
  name: string;
  /** True for the user's own member record. */
  isSelf: boolean;
}

/** The members of the signed-in user: their own record first, then their children. */
export function usePersonalSubjects(): Subject[] {
  const { me } = useAuth();
  return useMemo(() => {
    if (!me) return [];
    const own = me.member ? [{ memberId: me.member.id, name: `${me.member.firstName} ${me.member.lastName}`, isSelf: true }] : [];
    const children = me.children.map((child) => ({
      memberId: child.memberId,
      name: `${child.firstName} ${child.lastName}`,
      isSelf: false,
    }));
    return [...own, ...children];
  }, [me]);
}
