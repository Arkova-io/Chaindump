import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sidebar = html.match(/<aside class="tabs" id="sidebar">([\s\S]*?)<\/aside>/)?.[1] || '';

describe('Forensics analysis navigation', () => {
  it('exposes the four requested analysis destinations with exact labels', () => {
    const expected = [
      ['blockchain-analysis', 'Blockchain Analysis'],
      ['exchange-analysis', 'DEX/CEX Analysis'],
      ['casino-analysis', 'Web3 Casino Analysis'],
      ['nft-analysis', 'NFT and Ordinals Analysis'],
    ];

    for (const [view, label] of expected) {
      expect(sidebar).toContain(`data-view="${view}">${label}</button>`);
    }
  });

  it('does not split the primary Forensics navigation into legacy lifecycle pages', () => {
    expect(sidebar).not.toContain('data-view="grave"');
    expect(sidebar).not.toContain('data-view="mid"');
    expect(sidebar).not.toContain('data-view="nft"');
  });

  it('registers dedicated deep-link routes and view containers', () => {
    expect(html).toContain('id="blockchainanalysisview"');
    expect(html).toContain('id="exchangeanalysisview"');
    expect(html).toContain('id="casinoanalysisview"');
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'blockchain-analysis'/);
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'exchange-analysis'/);
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'casino-analysis'/);
    expect(html).toMatch(/KNOWN_VIEWS\s*=\s*\[[^\]]*'nft-analysis'/);
  });

  it('surfaces and sorts same-format dossier coverage on the blockchain index', () => {
    expect(html).toContain("row.dossier || {}");
    expect(html).toContain('dataCompletenessPct');
    expect(html).toContain('citationCount');
    expect(html).toContain('value="dossier"');
    expect(html).toContain('Report depth');
    expect(html).toContain('id="blockchainAnalysisStatus"');
    expect(html).toContain('row.dossierStatus');
    expect(html).toContain('Where chains stand');
    expect(html).toContain('Open full report →');
    expect(html).toContain("coverage: 'Legacy postmortem'");
    expect(html).toContain('full research reports');
    expect(html).toContain('id="blockchainAnalysisCausal"');
    expect(html).toContain("published: 'outcome explained'");
    expect(html).toContain("pending: 'explanation still open'");
    expect(html).toContain('Use the filters to compare thriving, stalled and failed chains.');
    expect(html).toContain('How many reports explain the outcome');
    expect(html).toContain('reports that explain the outcome');
    expect(html).toContain("row.causalStatus === state.blockchainAnalysisCausal");
    expect(html).toContain('function normalizeLegacyBlockchainAnalysis(row, lifecycle)');
  expect(html).toContain('function factObjectText(value)');
  expect(html).toContain("['classification', 'most_likely', 'base', 'bull', 'bear', 'confidence']");
  expect(html).toContain("<div class=\"dsub\">Why this outcome</div><div class=\"gbody\">${esc(d.why)}</div>");
  expect(html).toContain("<div class=\"dsub\">Strategic choices</div>");
  expect(html).toContain("<div class=\"dsub\">Material unknowns</div>");
  });
});

describe('DEX/CEX Analysis data surface', () => {
  it('loads normalized lifecycle cohorts for both venue types', () => {
    expect(html).toContain('/api/exchange-analysis?kind=${kind}');
    expect(html).toContain("['dex', 'cex'].map(fetchExchangeAnalysisKind)");
  });

  it('provides search, venue, lifecycle, cohort, quality, sort, and visible source controls', () => {
    expect(html).toContain('id="exchangeAnalysisSearch"');
    expect(html).toContain("filterButton('data-exchange-kind','dex'");
    expect(html).toContain("filterButton('data-exchange-lifecycle','successful'");
    expect(html).toContain('id="exchangeAnalysisCohort"');
    expect(html).toContain('id="exchangeAnalysisQuality"');
    expect(html).toContain('id="exchangeAnalysisForensic"');
    expect(html).toContain('Outcome explained');
    expect(html).toContain('id="exchangeAnalysisSort"');
    expect(html).toContain('Cited sources');
  });

  it('renders normalized token, comparison, provenance, and quality metadata', () => {
    expect(html).toContain('token.launch_timing');
    expect(html).toContain('row.comparisonKey');
    expect(html).toContain('row.metricAsOf');
    expect(html).toContain('row.qualityIssues');
    expect(html).toContain('operating_model_source_indexes');
    expect(html).toContain('metric_source_indexes');
    expect(html).toContain('custody_model_source_indexes');
    expect(html).toContain('product_cohort_source_indexes');
    expect(html).toContain('observation time unknown');
    expect(html).toContain('Evidence dates');
    expect(html).toContain('check again by');
    expect(html).toContain('function reviewDateIsDue(nextReviewAt)');
    expect(html).toContain('function forensicReviewState(review');
    expect(html).toContain('Observed status');
    expect(html).toContain('Where it ran');
    expect(html).toContain('Token launch');
    expect(html).toContain("String(row.metricUnit || '').toLowerCase()");
  });

  it('uses a visible evidence-gated causal-analysis contract instead of treating summary prose as proof', () => {
    expect(html).toContain('function forensicAnalysisHtml(contract, resolveRef');
    expect(html).toContain('Why this outcome');
    expect(html).toContain('Strategic choices');
    expect(html).toContain('What could have been different');
    expect(html).toContain('Material unknowns');
    expect(html).toContain('evidence-backed explanation is still being reviewed');
    expect(html).toContain('function forensicSourceArray(contract)');
    expect(html).toContain('forensicSourceArray(forensic)');
    expect(html).toContain("forensicStatus: explanationPublished ? 'published' : 'pending'");
    expect(html).toContain('canonicalEvidence.explanation_complete === true');
    expect(html).toContain("'outcome explained'");
    expect(html).toContain('key claims have independent support');
    expect(html).toContain('Unsupported conclusions are omitted');
    expect(html).toContain('publicationDepth: parsedObject(row.publication_depth)');
    expect(html).toContain('sections.push(exchangeFindingHtml(row))');
    expect(html).toContain('plainRead || exchangeFindingHtml(row)');
    expect(html).toContain("}, 'This exchange report is listed, but the evidence-backed explanation is still being reviewed.', depth)");
  });

  it('renders association rates and uncertainty without generated research prompts', () => {
    expect(html).toContain('function exchangeAssociationPanel(summary, label)');
    expect(html).toContain('Did a documented token launch correlate with success?');
    expect(html).toContain('Primary-chain context');
    expect(html).toContain('95% CI');
    expect(html).toContain('small sample');
    expect(html).not.toContain('Patterns worth testing as more reports are added');
    expect(html).toContain('single cases are withheld from the chart');
    expect(html).toContain("exchangeAssociationPanel(state.exchangeAnalysisSummaries.dex, 'DEX')");
    expect(html).toContain("exchangeAssociationPanel(state.exchangeAnalysisSummaries.cex, 'CEX')");
  });

  it('opens exchange dossiers through a public UI route instead of requiring API inspection', () => {
    expect(html).toContain('const dossierLink = profileHref(row.kind, row.slug);');
    expect(html).toContain("if (seg === 'profile' && rest && third) {");
    expect(html).toContain("} else if (seg === 'exchange' && rest && third && fourth) {");
    expect(html).toContain("openProfile(decodeURIComponent(rest), decodeURIComponent(fourth), { replace:true, focus:false });");
  });
});

describe('Stuck/Mid UI parity', () => {
  it('keeps the chain Stuck/Mid page visually live, not just a static dossier list', () => {
    expect(html).toContain('function midLiveWatch(data)');
    expect(html).toContain('Live mid watch — profiled chains on the live board');
    expect(html).toContain('data-mid-watch=');
    expect(html).toContain('sparkline(spark, 58, 18, 2)');
  });

  it('renders DEX/CEX Stuck/Mid with the same live-board and two-column analysis pattern as Dead & Dying', () => {
    expect(html).toContain('function renderExchangeMid(kind, data, board)');
    expect(html).toContain("const boardHtml = renderExchangeBoard(kind, board || (kind === 'dex' ? state.dexBoard : state.cexBoard));");
    expect(html).toContain("kind === 'dex' ? ensureDexBoard() : ensureCexBoard()");
    expect(html).toContain('Why exchanges succeed vs fail');
    expect(html).toContain('${head}${stats}${boardHtml}${panel}');
  });
});

describe('Web3 Casino Analysis data surface', () => {
  it('loads indexed dossiers with coverage, support audits, and lazy cited detail', () => {
    expect(html).toContain('/api/casinos?sort=${encodeURIComponent(state.casinoAnalysisSort)}');
    expect(html).toContain("fetch('/api/casino-coverage')");
    expect(html).toContain('/api/casino/${encodeURIComponent(caseId)}');
    expect(html).toContain('casinoAnalysisLoaded');
  });

  it('follows the Blockchain Analysis index contract with search, filters, sources, and direct UI dossier links', () => {
    expect(html).toContain('id="casinoAnalysisSearch"');
    expect(html).toContain('id="casinoAnalysisStatus"');
    expect(html).toContain('id="casinoAnalysisKind"');
    expect(html).toContain('id="casinoAnalysisSubtype"');
    expect(html).toContain('id="casinoAnalysisToken"');
    expect(html).toContain('${esc(item.registered_source_count)} cited source');
    expect(html).toContain("const dossierLink = profileHref('web3_casino', item.case_id);");
    expect(html).toContain("} else if (seg === 'casino' && rest) {");
    expect(html).toContain('loadCasinoAnalysisDetail(state.casinoAnalysisExpanded);');
    expect(html).toContain('Open report →');
    expect(html).not.toContain('Open coverage ledger →');
    expect(html).toContain('report${filtered.length===1');
  });

  it('uses the detailed cited casino case for expanded identity fields omitted from summary cards', () => {
    expect(html).toContain('const identity = detail.case || item;');
    expect(html).toContain('identity.legal_operator');
    expect(html).toContain('identity.date_precision');
  });

  it('keeps evidence gating while removing internal review plumbing from customer copy', () => {
    expect(html).toContain('function evidenceStatusParts(source)');
    expect(html).not.toContain("'desk check pending'");
    expect(html).toContain("item.registered_source_count");
    expect(html).toContain('cited source${Number(item.registered_source_count)');
    expect(html).toContain('Evidence by field and review status');
    expect(html).toContain('casinoEvidenceStatusHtml({ ...claim, registered: true');
    expect(html).toContain('${esc(passing)} of ${esc(total)} key claims have independent support');
    expect(html).toContain('function publicationDepthBanner(depth)');
    expect(html).toContain('Conclusion not published yet.');
    expect(html).toContain('Unsupported conclusions are omitted');
    expect(html).toContain('forensicAnalysisHtml(synthesis.forensic_analysis');
    expect(html).toContain("}, 'This casino report is listed, but the evidence-backed explanation is still being reviewed.', depth)");
    expect(html).toContain('return ` <a class="ecite"');
    expect(html).toContain('${sourceMetadataHtml(resolved)}');
  });

  it('keeps corpus coverage distinct from claim support', () => {
    expect(html).toContain("gstat(cases.length, 'casino reports')");
    expect(html).toContain("gstat(cases.filter(item=>item.status==='active').length, 'active businesses')");
    expect(html).toContain('No licence observation is published. Do not infer global legality from this report.');
    expect(html).toContain('Lifecycle timeline');
    expect(html).toContain('Where these businesses stand');
    expect(html).toContain('function casinoReviewState(item)');
    expect(html).toContain('detail.synthesis?.forensic_analysis?.review');
    expect(html).toContain('Bars use each report’s next-review date where one exists.');
    expect(html).toContain('Missing evidence stays labeled as a research gap.');
  });

  it('renders supported casino causal fields and withholds unsupported fields', () => {
    expect(html).toContain("'Why it worked or failed',");
    expect(html).toContain('synthesis.success_failure_hypotheses');
    expect(html).toContain("'What could have been different',");
    expect(html).toContain('synthesis.counterfactual');
    expect(html).toContain("'How much it depended on its chain', synthesis.chain_dependence");
    expect(html).toContain('casinoDepthSectionHtml(label, text, depth, isUnsupported)');
    expect(html).toContain('publicationPendingHtml(label.replaceAll');
  });
});

describe('customer-facing analysis headers', () => {
  it('keeps internal review operations and raw status endpoints out of page copy', () => {
    expect(html).not.toContain('function loadForensicsRefreshStatus()');
    expect(html).not.toContain("fetch('/api/forensics-refresh-status')");
    expect(html).not.toContain('Freshness check (every 6 hours):');
    expect(html).not.toContain('Research assistant:');
    expect(html).not.toContain('suggestions only; a person approves changes');
    expect(html).not.toContain('See review status →');
    expect(html).toContain('function pageHead(title, sub)');
    expect(html).toContain('<div class="gvintro">${sub}</div></div>');
  });
});

describe('NFT and Ordinals Analysis data surface', () => {
  it('uses the same sortable research-index pattern as Blockchain Analysis', () => {
    expect(html).toContain('These case studies show what happened');
    expect(html).toContain('id="nftCaseStatus"');
    expect(html).toContain('id="nftCaseChain"');
    expect(html).toContain('id="nftCaseSort"');
    expect(html).toContain('Citation count');
    expect(html).toContain('Open report →');
    expect(html).toContain('Browse live catalog ↓');
  });

  it('shows concise report dates and source counts without editorial plumbing', () => {
    expect(html).not.toContain('field-sourced report');
    expect(html).toContain('Report freshness');
    expect(html).not.toContain('90d policy');
    expect(html).not.toContain('earlier report with collection sources');
    expect(html).toContain("const checkedAt = p.evidence_policy?.last_verified_at");
    expect(html).toContain('lifecycle report');
    expect(html).toContain("if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(nextReviewAt || '')) return 'unknown';");
  });

  it('does not invent a marketplace route or coerce descriptive platform supply into NaN', () => {
    expect(html).toContain("String(c.category || '').includes('platform')");
    expect(html).toContain('function nftSupplyText(supply)');
  });

  it('opens a curated NFT dossier when a collection deep link is visited', () => {
    expect(html).toContain("openProfile('nft_collection', decodeURIComponent(rest), { replace:true, fallbackType:'ordinals_collection', focus:false });");
  });

  it('routes NFT depth through the same dedicated profile template as every category', () => {
    expect(html).toContain('function nftProfileAnalysisHtml(profile, sources, publicationDepth = null)');
    expect(html).toContain("['How the token captures value', profile?.token_model]");
    expect(html).toContain("['How much it depends on its chain', profile?.chain_dependence]");
    expect(html).toContain("['Risks in the evidence', profile?.risks]");
    expect(html).toContain("['Why this outcome · earlier report field', profile?.why]");
    expect(html).toContain("['Strategic choices · earlier report field', profile?.strategic_choices]");
    expect(html).toContain("['What could have been different · earlier report field', profile?.counterfactual]");
    expect(html).toContain("['What would change our mind · earlier report field', profile?.watch]");
    expect(html).toContain("['Open questions · earlier report field', profile?.unknowns]");
    expect(html).toContain("forensicAnalysisHtml(profile?.forensic_analysis, resolveRef");
    expect(html).toContain("PROFILE_SECTION_ORDER = Object.freeze([");
    expect(html).toContain("['what_it_is', 'What it is']");
    expect(html).toContain("['why_this_outcome', 'Why this outcome']");
    expect(html).toContain('function canonicalProfileHtml(profile)');
    expect(html).toContain("profileHref(String(c.chain || '').toLowerCase().includes('ordinals')");
    expect(html).not.toContain('High-risk field conclusion withheld.');
  });
});
