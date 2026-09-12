/// Turns GPT-Live's word-level transcript deltas into chat bubbles.
///
/// GPT-Live streams `session.input_transcript.delta` (learner) and
/// `session.output_transcript.delta` (tutor) with `start_ms` / `end_ms`
/// timestamps and nothing else: no item ids, no turn boundaries, no
/// "done" events. Because the model is full duplex, the two streams
/// overlap and interleave in wall-clock order (learner interrupts → a few
/// tutor fragments still land after the learner's first words).
///
/// Rules, chosen from a real session on 2026-09-12:
///   - Each role has at most one OPEN bubble. A delta appends to it when it
///     starts within GAP_MS of the bubble's last end time — regardless of
///     what the other role did in between, so overlapping speech doesn't
///     shred both bubbles into one-word fragments.
///   - A gap longer than GAP_MS in one role's speech opens a new bubble for
///     that role. The tutor pauses up to ~1s mid-sentence, and resumes
///     ~3s after being interrupted, so 2s separates the two cleanly.
///   - Bubbles are ordered by the time their first word started.
///   - `done` is set by `markIdle()` — the client calls it when no delta
///     has arrived for a while — and by the same-role gap rule. Click-to-
///     translate keys on `done`, so a bubble becomes translatable shortly
///     after its speaker stops.

export type SegmentedTurn = {
  id: string
  role: 'user' | 'tutor'
  text: string
  done: boolean
  startMs: number
  endMs: number
}

export const SEGMENT_GAP_MS = 2000

export class TranscriptSegmenter {
  private turns: SegmentedTurn[] = []
  private seq = 0

  /// Append one delta. Returns the full, ordered turn list (a new array
  /// each call so React state updates see a change).
  push(role: 'user' | 'tutor', delta: string, startMs: number, endMs: number): SegmentedTurn[] {
    if (!delta) return this.snapshot()
    const open = this.openTurn(role)
    if (open && startMs - open.endMs <= SEGMENT_GAP_MS) {
      open.text += delta
      open.endMs = Math.max(open.endMs, endMs)
      // The docs say deltas can arrive slightly out of order; keep the
      // earliest start so ordering stays stable.
      open.startMs = Math.min(open.startMs, startMs)
    } else {
      if (open) open.done = true
      this.turns.push({
        id: `${role}-${++this.seq}`,
        role,
        text: delta,
        done: false,
        startMs,
        endMs,
      })
      this.turns.sort((a, b) => a.startMs - b.startMs)
    }
    return this.snapshot()
  }

  /// Mark every open bubble as done. Called by the client after a quiet
  /// period so translate-on-click unlocks without waiting for the other
  /// speaker to talk.
  markIdle(): SegmentedTurn[] {
    for (const t of this.turns) t.done = true
    return this.snapshot()
  }

  snapshot(): SegmentedTurn[] {
    return this.turns.map((t) => ({ ...t }))
  }

  private openTurn(role: 'user' | 'tutor'): SegmentedTurn | undefined {
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const t = this.turns[i]
      if (t.role === role) return t.done ? undefined : t
    }
    return undefined
  }
}
