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

/**
 * Vercel's Node runtime invokes handlers as (req, res). A Web-style
 * `Request => Response` handler is accepted without complaint and its return
 * value is then discarded, so the response is never written and the request
 * hangs until the platform kills it. Hence the classic signature.
 */
export const config = { maxDuration: 60 }

/** The parts of Vercel's request and response we actually use. */
interface VercelRequest {
  method?: string
  body?: unknown
  on(event: 'data' | 'end' | 'error', cb: (chunk?: never) => void): void
  setEncoding(enc: string): void
}
interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const send = (body: unknown, status = 200) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.status(status).json(body)
  }

  if (req.method !== 'POST') return send({ error: 'Use POST.' }, 405)

  let body: ConceptRequest
  try {
    body = await readJsonBody(req)
  } catch {
    return send({ error: 'Body must be JSON.' }, 400)
  }

  const prompt = (body.prompt ?? '').trim()
  if (!prompt) return send({ error: 'A prompt is required.' }, 400)
  if (prompt.length > MAX_PROMPT) return send({ error: `Prompt over ${MAX_PROMPT} characters.` }, 400)

  const width = clamp(body.size?.width ?? 1024, 512, 1536)
  const height = clamp(body.size?.height ?? 1024, 512, 1536)

  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID
  const cfToken = process.env.CLOUDFLARE_API_TOKEN
  const fal = process.env.FAL_KEY
  const replicate = process.env.REPLICATE_API_TOKEN

  // Cheapest first. Cloudflare's free allowance covers ordinary use, so an
  // explicit IMAGE_PROVIDER is the only way to reach a paid one while it works.
  const preferred = process.env.IMAGE_PROVIDER?.toLowerCase()

  try {
    if ((!preferred || preferred === 'cloudflare') && cfAccount && cfToken) {
      return send(await viaCloudflare(cfAccount, cfToken, prompt))
    }
    if ((!preferred || preferred === 'fal') && fal) {
      return send(await viaFal(fal, prompt, body.negativePrompt, width, height))
    }
    if ((!preferred || preferred === 'replicate') && replicate) {
      return send(await viaReplicate(replicate, prompt, body.negativePrompt, width, height))
    }
    // No key is a normal state, not a crash: the app renders brand-kit artwork
    // without generated imagery, and says so.
    return send(
      {
        error: 'no-provider',
        message:
          'No image provider configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (free tier), or FAL_KEY, or REPLICATE_API_TOKEN, in the Vercel project environment.',
      },
      501,
    )
  } catch (e) {
    return send({ error: 'provider-failed', message: e instanceof Error ? e.message : String(e) }, 502)
  }
}

/** Vercel parses a JSON body for us, but fall back to the stream if it did not. */
async function readJsonBody(req: VercelRequest): Promise<ConceptRequest> {
  if (req.body && typeof req.body === 'object') return req.body as ConceptRequest
  if (typeof req.body === 'string') return JSON.parse(req.body) as ConceptRequest
  const raw = await new Promise<string>((resolve, reject) => {
    let d = ''
    req.setEncoding('utf8')
    req.on('data', (c) => (d += c))
    req.on('end', () => resolve(d))
    req.on('error', () => reject(new Error('stream error')))
  })
  return JSON.parse(raw || '{}') as ConceptRequest
}

// ── Cloudflare Workers AI ─────────────────────────────────────────────────
/**
 * The free option, and the default.
 *
 * 10,000 Neurons a day at no charge, which at roughly 58 Neurons for a
 * 1024x1024 four-step image is about 170 images a day — far more than a
 * packaging job needs.
 *
 * The model is FLUX.1 [schnell], and that specific variant matters: schnell is
 * Apache 2.0, so it is free to use on paid client work. FLUX.1 [dev] is not —
 * commercial use of dev needs a licence from Black Forest Labs. A contract
 * manufacturer generating artwork for customers is squarely commercial use, so
 * this codebase only ever names schnell.
 *
 * This endpoint takes a prompt and a step count and returns a fixed square
 * image; it has no size or negative-prompt parameters, which is why the prompt
 * itself is written to exclude text rather than relying on a negative.
 */
async function viaCloudflare(accountId: string, token: string, prompt: string): Promise<GeneratedImage> {
  const model = process.env.CLOUDFLARE_MODEL ?? '@cf/black-forest-labs/flux-1-schnell'
  const steps = clamp(Number(process.env.CLOUDFLARE_STEPS ?? 4), 1, 8)

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps }),
    },
  )
  if (!res.ok) throw new Error(`Cloudflare ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const data = (await res.json()) as {
    result?: { image?: string }
    success?: boolean
    errors?: { message: string }[]
  }
  if (data.errors?.length) throw new Error(`Cloudflare: ${data.errors.map((e) => e.message).join('; ')}`)

  const b64 = data.result?.image
  if (!b64) throw new Error('Cloudflare returned no image')
  return {
    // Already base64 — no second fetch, so nothing to taint the canvas.
    dataUrl: `data:image/jpeg;base64,${b64}`,
    provider: 'cloudflare',
    model,
    bytes: Math.round((b64.length * 3) / 4),
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

