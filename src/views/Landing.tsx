import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

interface Props {
  onStart: () => void
}

/**
 * The public page.
 *
 * The hero is a die line drawing itself, because that is the most
 * characteristic object in this business and it is the thing the tool actually
 * produces. One motion moment on load, nothing else animates.
 */
export function Landing({ onStart }: Props) {
  const root = useRef<HTMLDivElement>(null)

  /**
   * The page's single orchestrated moment: the die line draws itself, then the
   * safe areas fade up, then the copy rises.
   *
   * Each path is measured with getTotalLength() and given its own dash length,
   * so a 30 mm crease and a 200 mm cut draw at the same speed. A fixed dash
   * array — which is all CSS can do — makes short lines snap and long lines
   * crawl. This is the reason the animation moved to GSAP.
   */
  useGSAP(
    () => {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const lines = gsap.utils.toArray<SVGPathElement>('.dh-cut path, .dh-crease path')

      for (const path of lines) {
        const len = path.getTotalLength()
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })
      }

      if (prefersReduced) {
        gsap.set(lines, { strokeDashoffset: 0 })
        gsap.set(['.dh-safe path', '.hero-copy > *'], { opacity: 1, y: 0 })
        return
      }

      gsap
        .timeline({ defaults: { ease: 'power2.out' } })
        .to('.dh-cut path', { strokeDashoffset: 0, duration: 1.1, stagger: 0.045 })
        .to('.dh-crease path', { strokeDashoffset: 0, duration: 0.8, stagger: 0.035 }, '-=0.75')
        .from('.dh-safe path', { opacity: 0, duration: 0.5, stagger: 0.04 }, '-=0.3')
        .from('.hero-copy > *', { opacity: 0, y: 14, duration: 0.7, stagger: 0.09 }, 0.15)
    },
    { scope: root },
  )

  return (
    <div className="landing" ref={root}>
      <header className="l-bar">
        <span className="wordmark">
          SF <em>Pack</em>
        </span>
        <nav>
          <a href="#what">What it does</a>
          <a href="#checks">What gets checked</a>
          <button className="solid-btn" onClick={onStart}>
            Open the tool
          </button>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>
            See the pack.
            <br />
            Know it&rsquo;s legal.
          </h1>
          <p className="lede">
            Describe your product in a sentence. Get a die line at true size, a pack you can turn
            around in 3D, a facts panel with the percentages worked out, and a list of everything
            that would stop it going to print.
          </p>
          <div className="hero-cta">
            <button className="solid-btn big" onClick={onStart}>
              Describe your pack
            </button>
            <span className="cta-note">
              Free. We make our money manufacturing, not selling software.
            </span>
          </div>
        </div>

        <figure className="hero-art" aria-label="A folding carton die line drawing itself">
          <DielineHero />
          <figcaption>Reverse tuck end, 60 × 60 × 120 mm. Magenta cuts, cyan creases.</figcaption>
        </figure>
      </section>

      <section className="problem">
        <div className="problem-inner">
          <h2>AI packaging tools make beautiful, unlawful packs</h2>
          <p>
            We asked one of the best of them for a UK food supplement pouch. Forty seconds later it
            returned a gorgeous photograph of a pouch for a brand that does not exist, carrying an
            ingredient list nobody had given it.
          </p>
          <ul className="missing">
            <li>No statutory name</li>
            <li>No net quantity</li>
            <li>No warnings box</li>
            <li>No responsible-person address</li>
            <li>No allergen statement</li>
            <li>No barcode</li>
          </ul>
          <p className="problem-kicker">
            Six ways illegal in Great Britain, and no file a printer could use. The picture is not
            the hard part. Everything after it is.
          </p>
        </div>
      </section>

      <section className="what" id="what">
        <h2>From a sentence to a print file</h2>
        <ol className="steps">
          <li>
            <h3>Describe it</h3>
            <p>
              &ldquo;300 ml immune powder in a stand-up pouch for the UK.&rdquo; Anything you leave
              out gets asked for. Nothing gets invented.
            </p>
          </li>
          <li>
            <h3>See it</h3>
            <p>
              The pack renders from your own words, on a die line built to the millimetre from the
              formats we actually fill.
            </p>
          </li>
          <li>
            <h3>Check it</h3>
            <p>
              Twenty-eight rules run on every keystroke — net quantity units, warnings, allergens,
              claims, barcode check digits, panel type against market.
            </p>
          </li>
          <li>
            <h3>Print it</h3>
            <p>
              A PDF/X-4 die line with real CMYK and named spot separations, ready for the press
              that will run it.
            </p>
          </li>
        </ol>
      </section>

      <section className="checks" id="checks">
        <div className="checks-inner">
          <h2>What gets checked, and who answers for it</h2>
          <p className="checks-lede">
            The software finds problems and frames questions. It does not issue the regulatory
            opinion — a person does, and the finding says which person.
          </p>
          <table className="roles">
            <tbody>
              <tr>
                <th scope="row">Claims, warnings, mandatory statements</th>
                <td>UK and EU compliance</td>
              </tr>
              <tr>
                <th scope="row">Supplement Facts, structure/function claims</th>
                <td>A US regulatory reviewer — never the UK team</td>
              </tr>
              <tr>
                <th scope="row">Ingredient deck against the formulation</th>
                <td>Formulation</td>
              </tr>
              <tr>
                <th scope="row">Die line, bleed, seals, print file</th>
                <td>Design and pre-press</td>
              </tr>
              <tr>
                <th scope="row">Market, GTINs, registrations, approvals</th>
                <td>You, in writing</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="closer">
        <h2>Start with a sentence</h2>
        <button className="solid-btn big" onClick={onStart}>
          Describe your pack
        </button>
      </section>

      <footer className="l-foot">
        <span>Supplement Factory</span>
        <span>Bespoke contract supplement manufacturing</span>
      </footer>
    </div>
  )
}

/**
 * A carton flat whose cut and crease lines stroke on once, on load.
 *
 * The topology is the real one the engine generates, not a decorative box:
 * panels are back / side / front / side left to right, the top edge creases
 * everywhere a flap hinges off it and CUTS across the front where there is no
 * flap, and the bottom edge does the mirror of that across the back.
 */
function DielineHero() {
  return (
    <svg viewBox="0 0 320 250" className="dieline-hero" role="img">
      <g className="dh-crease">
        {/* panel folds; the right-hand edge at x=300 is the edge of the blank */}
        <path d="M60 70V180M120 70V180M180 70V180M240 70V180" />
        {/* top edge: creases under the tuck and both dust flaps */}
        <path d="M60 70h60M120 70h60M240 70h60" />
        {/* bottom edge: creases under both dust flaps and the front tuck */}
        <path d="M120 180h60M180 180h60M240 180h60" />
      </g>
      <g className="dh-cut">
        {/* glue flap, tapered so it tucks in without showing */}
        <path d="M60 72 44 76v98l16 4" />
        {/* edge of the blank */}
        <path d="M300 70V180" />
        {/* open edges: no flap above the front, none below the back */}
        <path d="M180 70h60" />
        <path d="M60 180h60" />
        {/* tuck off the back panel, dust flaps off both sides */}
        <path d="M60 70V44l6-6h48l6 6v26" />
        <path d="M120 70V50l5-5h50l5 5v20" />
        <path d="M240 70V50l5-5h50l5 5v20" />
        {/* tuck off the front panel, dust flaps off both sides */}
        <path d="M180 180v26l6 6h48l6-6v-26" />
        <path d="M120 180v20l5 5h50l5-5v-20" />
        <path d="M240 180v20l5 5h50l5-5v-20" />
      </g>
      <g className="dh-safe">
        <path d="M68 78h44v94H68zM128 78h44v94h-44zM188 78h44v94h-44zM248 78h44v94h-44z" />
      </g>
    </svg>
  )
}
