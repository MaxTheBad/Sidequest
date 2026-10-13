export function partitionInvitationResults(recipientIds, results) {
  const succeededIds = [];
  const failedIds = [];
  let firstErrorMessage = "";
  recipientIds.forEach((recipientId, index) => {
    const error = results[index]?.error || null;
    if (error) {
      failedIds.push(recipientId);
      firstErrorMessage ||= String(error?.message || error || "");
    } else {
      succeededIds.push(recipientId);
    }
  });
  return { succeededIds, failedIds, firstErrorMessage };
}

export function isTerminalInvitationError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("no longer available")
    || message.includes("no longer accepting guests")
    || message.includes("already full");
}

export function approvedGuestsMissingLocation(members, creatorId, accessUserIds) {
  return [...new Set(members
    .filter((member) => (member.status || "approved") === "approved"
      && member.id
      && member.id !== creatorId
      && member.role !== "creator"
      && !accessUserIds.includes(member.id))
    .map((member) => member.id))];
}
