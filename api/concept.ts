/**
 * POST /api/concept — generate a surface graphic for a pack face.
 *
 * Runs server side for two reasons. The API key never reaches the browser
 * bundle, and the generated image is fetched here and returned as a data URL:
 * a cross-origin image would taint the canvas it is drawn into and WebGL then
 * refuses to upload it as a texture.
 *
 * Providers are behind one interface on purpose. Image models are replaced
 * every few months and the rest of this codebase should not care which one is
 * in use.
 */

export const config = { runtime: 'nodejs' }

interface ConceptRequest {
  prompt: string
  negativePrompt?: string
  size?: { width: number; height: number }
}

interface GeneratedImage {
  dataUrl: string
  provider: string
  model: string
  bytes: number
}

const MAX_PROMPT = 2000
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  let body: ConceptRequest
  try {
    body = (await req.json()) as ConceptRequest
  } catch {
    return json({ error: 'Body must be JSON.' }, 400)
  }

  const prompt = (body.prompt ?? '').trim()
  if (!prompt) return json({ error: 'A prompt is required.' }, 400)
  if (prompt.length > MAX_PROMPT) return json({ error: `Prompt over ${MAX_PROMPT} characters.` }, 400)

  const width = clamp(body.size?.width ?? 1024, 512, 1536)
  const height = clamp(body.size?.height ?? 1024, 512, 1536)

  const fal = process.env.FAL_KEY
  const replicate = process.env.REPLICATE_API_TOKEN

  try {
    if (fal) {
      return json(await viaFal(fal, prompt, body.negativePrompt, width, height))
    }
    if (replicate) {
      return json(await viaReplicate(replicate, prompt, body.negativePrompt, width, height))
    }
    // No key is a normal state, not a crash: the app renders brand-kit artwork
    // without generated imagery, and says so.
    return json(
      {
        error: 'no-provider',
        message:
          'No image provider configured. Set FAL_KEY (or REPLICATE_API_TOKEN) in the Vercel project environment to enable concept art.',
      },
      501,
    )
  } catch (e) {
    return json({ error: 'provider-failed', message: e instanceof Error ? e.message : String(e) }, 502)
  }
}

// ── fal.ai ────────────────────────────────────────────────────────────────
async function viaFal(
  key: string,
  prompt: string,
  negativePrompt: string | undefined,
  width: number,
  height: number,
): Promise<GeneratedImage> {
  const model = process.env.FAL_MODEL ?? 'fal-ai/flux/schnell'
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      // Only sent when the model accepts it; models that ignore it are unharmed.
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      image_size: { width, height },
      num_images: 1,
      enable_safety_checker: true,
    }),
  })
  if (!res.ok) throw new Error(`fal.ai ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const data = (await res.json()) as { images?: { url: string }[] }
  const url = data.images?.[0]?.url
  if (!url) throw new Error('fal.ai returned no image')
  return { dataUrl: await toDataUrl(url), provider: 'fal.ai', model, bytes: 0 }
}

// ── Replicate ─────────────────────────────────────────────────────────────
async function viaReplicate(
  token: string,
  prompt: string,
  negativePrompt: string | undefined,
  width: number,
  height: number,
): Promise<GeneratedImage> {
  const model = process.env.REPLICATE_MODEL ?? 'black-forest-labs/flux-schnell'
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Ask Replicate to hold the connection open rather than making us poll.
      Prefer: 'wait=55',
    },
    body: JSON.stringify({
      input: {
        prompt,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        width,
        height,
        num_outputs: 1,
      },
    }),
  })
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const data = (await res.json()) as { output?: string | string[]; error?: string; status?: string }
  if (data.error) throw new Error(`Replicate: ${data.error}`)
  const url = Array.isArray(data.output) ? data.output[0] : data.output
  if (!url) throw new Error(`Replicate returned no image (status ${data.status ?? 'unknown'})`)
  return { dataUrl: await toDataUrl(url), provider: 'replicate', model, bytes: 0 }
}

// ── helpers ───────────────────────────────────────────────────────────────
async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch the generated image (${res.status})`)
  const type = res.headers.get('content-type') ?? 'image/png'
  if (!type.startsWith('image/')) throw new Error(`Provider returned ${type}, not an image`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error('Generated image is implausibly large')
  return `data:${type};base64,${Buffer.from(buf).toString('base64')}`
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
