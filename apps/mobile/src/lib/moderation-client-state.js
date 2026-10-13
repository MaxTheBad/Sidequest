export function createModerationActionGate() {
  let generation = 0;
  let pending = false;
  return {
    begin(scope) {
      if (pending) return null;
      pending = true;
      generation += 1;
      return { generation, scope };
    },
    isCurrent(token) {
      return Boolean(token && pending && token.generation === generation);
    },
    finish(token) {
      if (token && token.generation === generation) pending = false;
    },
    invalidate() {
      generation += 1;
      pending = false;
    },
  };
}

export function isAllowedReportReason(reason, options) {
  return typeof reason === "string" && options.some((option) => option.value === reason);
}

export function confirmedBlockMutationError(result, error) {
  if (error) {
    return error instanceof Error
      ? error
      : new Error(typeof error.message === "string" && error.message ? error.message : "Could not block user.");
  }
  return result === true ? null : new Error("Could not block user.");
}
