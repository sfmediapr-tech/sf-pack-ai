import { buildConceptBrief, type ConceptInput } from '../core/concept/prompt'

export type ConceptResult =
  | { ok: true; image: HTMLImageElement; summary: string; provider: string; model: string }
  | { ok: false; kind: 'no-provider' | 'failed'; message: string }

/**
 * Ask the server for a surface graphic.
 *
 * Failure is a normal state here, not an exception: with no provider key the
 * app keeps working and renders brand-kit artwork instead. The caller shows the
 * message rather than pretending nothing happened.
 */
export async function generateConcept(input: ConceptInput, signal?: AbortSignal): Promise<ConceptResult> {
  const brief = buildConceptBrief(input)

  let res: Response
  try {
    res = await fetch('/api/concept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: brief.prompt, negativePrompt: brief.negativePrompt, size: brief.size }),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) return { ok: false, kind: 'failed', message: 'Cancelled.' }
    return {
      ok: false,
      kind: 'failed',
      message: `Could not reach the concept service. ${e instanceof Error ? e.message : ''}`.trim(),
    }
  }

  const body = (await res.json().catch(() => ({}))) as {
    dataUrl?: string
    provider?: string
    model?: string
    error?: string
    message?: string
  }

  if (!res.ok || !body.dataUrl) {
    return {
      ok: false,
      kind: body.error === 'no-provider' ? 'no-provider' : 'failed',
      message: body.message ?? `Concept generation failed (${res.status}).`,
    }
  }

  try {
    const image = await loadImage(body.dataUrl)
    return {
      ok: true,
      image,
      summary: brief.summary,
      provider: body.provider ?? 'unknown',
      model: body.model ?? 'unknown',
    }
  } catch {
    return { ok: false, kind: 'failed', message: 'The generated image could not be decoded.' }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}
