import type { ComplianceReport } from '../core/compliance/rules'

const OWNER: Record<string, string> = {
  design: 'Design',
  'compliance-uk-eu': 'Compliance UK/EU',
  'us-regulatory': 'US regulatory',
  formulation: 'Formulation',
  client: 'Client',
  account: 'Account',
  ops: 'Ops',
}

/**
 * Findings read as marks on a proof rather than rows in a spreadsheet: a
 * coloured rule down the left, the finding, what to do, and who answers for it.
 * A four-column table never fits the rail, and severity belongs next to the
 * text it qualifies, not in a column of its own.
 */
export function FindingsTable({ report }: { report: ComplianceReport }) {
  const tone = report.counts.BLOCKER ? 'bad' : report.counts.MAJOR + report.counts.QUESTION ? 'warn' : 'good'

  return (
    <div className="findings">
      <div className={`verdict verdict-${tone}`}>
        <strong>{report.verdict}</strong>
        <span>{report.headline}</span>
      </div>

      <div className="counts">
        <Count label="Blockers" n={report.counts.BLOCKER} tone="bad" />
        <Count label="Major" n={report.counts.MAJOR} tone="warn" />
        <Count label="Minor" n={report.counts.MINOR} tone="mute" />
        <Count label="To confirm" n={report.counts.QUESTION} tone="info" />
      </div>

      {report.findings.length === 0 ? (
        <p className="empty">No findings. The record passes every rule in the engine.</p>
      ) : (
        <ol className="flist">
          {report.findings.map((f) => (
            <li key={f.id} className={`fitem fitem-${f.severity.toLowerCase()}`}>
              <div className="fitem-head">
                <span className={`sev sev-${f.severity.toLowerCase()}`}>{f.severity}</span>
                <span className="fitem-id">{f.id}</span>
                <span className="fitem-owner">{OWNER[f.owner] ?? f.owner}</span>
              </div>
              <p className="f-text">{f.finding}</p>
              <p className="f-fix">{f.proposedFix}</p>
              <p className="f-why">{f.rationale}</p>
            </li>
          ))}
        </ol>
      )}

      <p className="reviewer-note">
        Routed to <strong>{report.reviewer}</strong>
      </p>
    </div>
  )
}

function Count({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className={`count count-${tone} ${n === 0 ? 'count-zero' : ''}`}>
      <span className="count-n">{n}</span>
      <span className="count-l">{label}</span>
    </div>
  )
}
