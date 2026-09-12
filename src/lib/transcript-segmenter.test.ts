import { describe, it, expect } from 'vitest'
import { TranscriptSegmenter, SEGMENT_GAP_MS } from './transcript-segmenter'

// Fragments below are lifted from a real gpt-live-1 session (2026-09-12)
// so the tests exercise the actual interleaving the API produces, not an
// idealized one.

describe('TranscriptSegmenter', () => {
  it('joins consecutive deltas of one speaker into one bubble, verbatim', () => {
    const seg = new TranscriptSegmenter()
    seg.push('user', ' Oi', 8000, 8200)
    seg.push('user', ', Natália', 8800, 9000)
    const turns = seg.push('user', ', tudo', 9400, 9600)
    expect(turns).toHaveLength(1)
    expect(turns[0].text).toBe(' Oi, Natália, tudo')
    expect(turns[0].role).toBe('user')
    expect(turns[0].done).toBe(false)
  })

  it('keeps overlapping speech in two bubbles instead of shredding it', () => {
    // Learner finishing a sentence while the tutor starts replying.
    const seg = new TranscriptSegmenter()
    seg.push('user', ' praticar', 11000, 11200)
    seg.push('user', ' português', 11600, 11800)
    seg.push('tutor', ' Oi', 11800, 12000)
    seg.push('user', ' hoje', 12000, 12200)
    const turns = seg.push('tutor', '! Que', 12000, 12200)
    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({ role: 'user', text: ' praticar português hoje' })
    expect(turns[1]).toMatchObject({ role: 'tutor', text: ' Oi! Que' })
  })

  it('opens a new bubble when the same speaker resumes after a long gap', () => {
    // Tutor is interrupted at 15.8s and resumes at 18.8s.
    const seg = new TranscriptSegmenter()
    seg.push('tutor', ' hoje', 15400, 15600)
    seg.push('tutor', ' sim.', 15600, 15800)
    seg.push('user', ' Espera', 15800, 16000)
    const turns = seg.push('tutor', ' Tudo bem', 18800, 19000)
    expect(turns.map((t) => [t.role, t.text])).toEqual([
      ['tutor', ' hoje sim.'],
      ['user', ' Espera'],
      ['tutor', ' Tudo bem'],
    ])
    expect(turns[0].done).toBe(true)
    expect(turns[2].done).toBe(false)
  })

  it('tolerates a mid-sentence pause up to the gap threshold', () => {
    const seg = new TranscriptSegmenter()
    seg.push('tutor', ' aqui!', 21600, 21800)
    const turns = seg.push('tutor', ' Vamos', 21800 + SEGMENT_GAP_MS, 22000 + SEGMENT_GAP_MS)
    expect(turns).toHaveLength(1)
    expect(turns[0].text).toBe(' aqui! Vamos')
  })

  it('orders bubbles by first-word start time', () => {
    const seg = new TranscriptSegmenter()
    seg.push('tutor', ' Oi', 1200, 1400)
    seg.push('user', ' Olá', 5000, 5200)
    const turns = seg.push('tutor', ' Que bom', 9000, 9200)
    expect(turns.map((t) => t.role)).toEqual(['tutor', 'user', 'tutor'])
  })

  it('markIdle finishes every open bubble', () => {
    const seg = new TranscriptSegmenter()
    seg.push('user', ' Oi', 0, 200)
    seg.push('tutor', ' Olá', 300, 500)
    const turns = seg.markIdle()
    expect(turns.every((t) => t.done)).toBe(true)
    // A later delta after idle opens a fresh bubble rather than reviving one.
    const next = seg.push('tutor', ' Tudo bem?', 900, 1100)
    expect(next).toHaveLength(3)
  })

  it('ignores empty deltas', () => {
    const seg = new TranscriptSegmenter()
    expect(seg.push('user', '', 0, 100)).toHaveLength(0)
  })

  it('returns fresh arrays so React sees each update', () => {
    const seg = new TranscriptSegmenter()
    const a = seg.push('user', ' a', 0, 100)
    const b = seg.push('user', ' b', 100, 200)
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(b[0])
  })
})
