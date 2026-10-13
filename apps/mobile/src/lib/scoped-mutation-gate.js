export function createScopedMutationGate() {
  let generation = 0;
  let active = null;
  return {
    begin(scope) {
      if (!scope || active) return null;
      active = { generation: ++generation, scope };
      return active;
    },
    isCurrent(token, scope) {
      return Boolean(token && active === token && token.generation === generation && token.scope === scope);
    },
    finish(token) {
      if (active === token) active = null;
    },
    invalidate() {
      generation += 1;
      active = null;
    },
  };
}

export function createLatestScopedRequestGate() {
  let generation = 0;
  return {
    begin(scope) {
      return { generation: ++generation, scope };
    },
    isCurrent(token, currentScope) {
      return Boolean(token && token.generation === generation && token.scope === currentScope);
    },
    invalidate() {
      generation += 1;
    },
  };
}

export async function runConfirmedScopedMutation({ gate, scope, confirm, mutate, currentScope }) {
  const token = gate.begin(scope);
  if (!token) return { status: "blocked" };
  try {
    if (!await confirm()) return { status: "canceled" };
    const value = await mutate();
    if (!gate.isCurrent(token, currentScope())) return { status: "stale" };
    return { status: "succeeded", value };
  } catch (error) {
    if (!gate.isCurrent(token, currentScope())) return { status: "stale" };
    return { status: "failed", error };
  } finally {
    gate.finish(token);
  }
}
