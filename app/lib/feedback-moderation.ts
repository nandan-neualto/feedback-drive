type Patch = { status?: string; published?: boolean; teamReply?: string };

/** Build updates from validated, explicitly provided fields without copying stale row values. */
export function feedbackPatchUpdate(patch: Patch, timestamp: string): { assignments: string[]; values: (string | number)[] } {
  const assignments: string[] = [];
  const values: (string | number)[] = [];
  if (patch.status !== undefined) { assignments.push('status=?'); values.push(patch.status); }
  if (patch.status === 'hidden') assignments.push('published=0');
  else if (patch.published !== undefined) {
    // A concurrent archive must stay private unless this request explicitly changes its status.
    const status = patch.status === undefined ? 'status' : '?';
    assignments.push(`published=CASE WHEN ${status}='hidden' OR consent=0 THEN 0 ELSE ? END`);
    if (patch.status !== undefined) values.push(patch.status);
    values.push(Number(patch.published));
  }
  if (patch.teamReply !== undefined) {
    assignments.push("team_reply_at=CASE WHEN ?='' THEN '' WHEN team_reply=? AND team_reply_at!='' THEN team_reply_at ELSE ? END", 'team_reply=?');
    values.push(patch.teamReply, patch.teamReply, timestamp, patch.teamReply);
  }
  return { assignments, values };
}
