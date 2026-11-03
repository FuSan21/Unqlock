// Coalesces work into one pass on the next animation frame, however often it is asked for before then.
// `pending` says whether a pass is already due, so an observer can skip checking records meanwhile.
export function frameScheduler(run: () => void) {
  let due = false;
  return {
    schedule() {
      if (due) return;
      due = true;
      requestAnimationFrame(() => { due = false; run(); });
    },
    get pending() { return due; }
  };
}
