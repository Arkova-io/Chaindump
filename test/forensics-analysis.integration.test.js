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
    expect(html).toContain('Dossier coverage');
    expect(html).toContain('id="blockchainAnalysisStatus"');
    expect(html).toContain('row.dossierStatus');
    expect(html).toContain('Dossier status mix');
    expect(html).toContain('Open chain dossier →');
    expect(html).toContain("coverage: 'Legacy postmortem'");
    expect(html).toContain('structural dossiers');
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
    expect(html).toContain('Indexed causal maps');
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
    expect(html).toContain('lifecycle evidence');
    expect(html).toContain('next review');
    expect(html).toContain('function reviewDateIsDue(nextReviewAt)');
    expect(html).toContain('function forensicReviewState(review');
    expect(html).toContain('Observed status');
    expect(html).toContain('Deployment context');
    expect(html).toContain('Token launch');
    expect(html).toContain("String(row.metricUnit || '').toLowerCase()");
  });

  it('uses a visible evidence-gated causal-analysis contract instead of treating summary prose as proof', () => {
    expect(html).toContain('function forensicAnalysisHtml(contract, resolveRef');
    expect(html).toContain('Why this outcome');
    expect(html).toContain('Strategic choices');
    expect(html).toContain('What could have been different');
    expect(html).toContain('Material unknowns');
    expect(html).toContain('structured causal analysis is pending review');
    expect(html).toContain('function forensicSourceArray(contract)');
    expect(html).toContain('forensicSourceArray(forensic)');
    expect(html).toContain("forensicStatus: analysis.forensic_analysis_status || (forensic ? 'published' : 'pending')");
    expect(html).toContain("'causal maps indexed'");
    expect(html).toContain('Exchange claim-support audit:');
    expect(html).toContain('high-risk claims meet policy');
    expect(html).toContain('publicationDepth: parsedObject(row.publication_depth)');
    expect(html).toContain('sections.push(exchangeFindingHtml(row))');
    expect(html).toContain('${exchangeFindingHtml(row)}');
    expect(html).toContain("}, 'This exchange dossier is indexed; its normalized causal contract is pending review.', depth)");
  });

  it('renders association rates, uncertainty, and falsifiers instead of causal-sounding trend prose', () => {
    expect(html).toContain('function exchangeAssociationPanel(summary, label)');
    expect(html).toContain('Did a documented token launch correlate with success?');
    expect(html).toContain('Primary-chain context');
    expect(html).toContain('95% CI');
    expect(html).toContain('small sample');
    expect(html).toContain('Predeclared hypotheses and what would falsify them');
    expect(html).toContain('single cases are withheld from the chart');
    expect(html).toContain("exchangeAssociationPanel(state.exchangeAnalysisSummaries.dex, 'DEX')");
    expect(html).toContain("exchangeAssociationPanel(state.exchangeAnalysisSummaries.cex, 'CEX')");
  });

  it('opens exchange dossiers through a public UI route instead of requiring API inspection', () => {
    expect(html).toContain('const dossierLink = `/exchange/${encodeURIComponent(row.kind)}/${encodeURIComponent(row.lifecycle)}/${encodeURIComponent(row.slug)}`;');
    expect(html).toContain("} else if (seg === 'exchange' && rest && third && fourth) {");
    expect(html).toContain('state.exchangeAnalysisExpanded = `${decodeURIComponent(rest)}:${decodeURIComponent(third)}:${decodeURIComponent(fourth)}`;');
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
    expect(html).toContain('Evidence: ${esc(item.registered_source_count)} registered');
    expect(html).toContain('const dossierLink = `/casino/${encodeURIComponent(item.case_id)}`;');
    expect(html).toContain("} else if (seg === 'casino' && rest) {");
    expect(html).toContain('loadCasinoAnalysisDetail(state.casinoAnalysisExpanded);');
    expect(html).toContain('Open dossier →');
    expect(html).toContain('Open coverage ledger →');
    expect(html).toContain('indexed dossier${filtered.length===1');
  });

  it('uses the detailed cited casino case for expanded identity fields omitted from summary cards', () => {
    expect(html).toContain('const identity = detail.case || item;');
    expect(html).toContain('identity.legal_operator');
    expect(html).toContain('identity.date_precision');
  });

  it('visibly separates registered, reachable, and editor-reviewed casino evidence', () => {
    expect(html).toContain('function evidenceStatusParts(source)');
    expect(html).toContain("'editor review pending'");
    expect(html).toContain('identity.registered_source_count');
    expect(html).toContain('identity.reachable_source_count');
    expect(html).toContain('identity.reviewed_source_count');
    expect(html).toContain('Field evidence &amp; review status');
    expect(html).toContain('casinoEvidenceStatusHtml({ ...claim, registered: true');
    expect(html).toContain('High-risk claim support: ${esc(passing)} of ${esc(total)} meet policy');
    expect(html).toContain("function publicationDepthBanner(depth, corpusLabel = 'Corpus inclusion')");
    expect(html).toContain('High-risk claim withheld — independent support pending.');
    expect(html).toContain('Unsupported lifecycle, causal, legal, loss, and counterfactual conclusions are withheld below.');
    expect(html).toContain('forensicAnalysisHtml(synthesis.forensic_analysis');
    expect(html).toContain("}, 'This casino dossier is indexed; its normalized causal contract is pending review.', depth)");
    expect(html).toContain('return ` <a class="ecite"');
    expect(html).toContain('${sourceMetadataHtml(resolved)}');
  });

  it('keeps corpus coverage distinct from claim support', () => {
    expect(html).toContain('expected dossiers missing');
    expect(html).toContain('expected dossier IDs remain absent from the indexed corpus');
    expect(html).toContain('No cross-case “largest casino” ranking is computed.');
    expect(html).toContain('No licence observation is published. Do not infer global legality from this dossier.');
    expect(html).toContain('Lifecycle timeline');
    expect(html).toContain('Cohort evidence map');
    expect(html).toContain('function casinoReviewState(item)');
    expect(html).toContain('detail.synthesis?.forensic_analysis?.review');
    expect(html).toContain('each causal map’s explicit next-review date');
    expect(html).toContain('which lifecycle, causal, legal, loss, and counterfactual claims meet policy or are withheld');
  });

  it('renders supported casino causal fields and withholds unsupported fields', () => {
    expect(html).toContain("'Success / failure hypotheses',");
    expect(html).toContain('synthesis.success_failure_hypotheses');
    expect(html).toContain("'Counterfactual',");
    expect(html).toContain('synthesis.counterfactual');
    expect(html).toContain("'Chain dependence', synthesis.chain_dependence");
    expect(html).toContain('casinoDepthSectionHtml(label, text, depth, isUnsupported)');
    expect(html).toContain('publicationPendingHtml(label.replaceAll');
  });
});

describe('six-hour forensic review surface', () => {
  it('shows the review cadence and links the visible status to the public API', () => {
    expect(html).toContain('function loadForensicsRefreshStatus()');
    expect(html).toContain("fetch('/api/forensics-refresh-status')");
    expect(html).toContain('Six-hour review scan:');
    expect(html).toContain('Proposal research agent:');
    expect(html).toContain('no run recorded (opt-in workflow)');
    expect(html).toContain('refresh_freshness');
    expect(html).toContain('proposal_agent_freshness');
    expect(html).toContain('proposal_agent_last_completed');
    expect(html).toContain('last successful completion');
    expect(html).toContain('STALE');
    expect(html).toContain('next due');
    expect(html).toContain('proposal-only; human promotion required');
    expect(html).toContain("forensicsRefreshStatus = response.ok ? 'loaded' : 'unavailable'");
    expect(html).toContain('human promotion required');
    expect(html).toContain('Open review status →');
  });
});

describe('NFT and Ordinals Analysis data surface', () => {
  it('uses the same sortable research-index pattern as Blockchain Analysis', () => {
    expect(html).toContain('NFT/Ordinals claim-support audit:');
    expect(html).toContain('id="nftCaseStatus"');
    expect(html).toContain('id="nftCaseChain"');
    expect(html).toContain('id="nftCaseSort"');
    expect(html).toContain('Citation count');
    expect(html).toContain('Open dossier →');
    expect(html).toContain('Browse live catalog ↓');
  });

  it('shows collapsed citation and coverage metadata before expansion', () => {
    expect(html).toContain('field-citation schema');
    expect(html).toContain('Review freshness');
    expect(html).toContain('90d policy');
    expect(html).toContain('legacy/collection-cited');
    expect(html).toContain("srcHtml(sourceArray(citedSources).slice(0, 3), 'Cited sources: ')");
    expect(html).toContain('lifecycle case stud');
    expect(html).toContain("if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(nextReviewAt || '')) return 'unknown';");
  });

  it('does not invent a marketplace route or coerce descriptive platform supply into NaN', () => {
    expect(html).toContain("String(c.category || '').includes('platform')");
    expect(html).toContain('function nftSupplyText(supply)');
  });

  it('opens a curated NFT dossier when a collection deep link is visited', () => {
    expect(html).toContain("state.nftExpanded = decodeURIComponent(rest);");
    expect(html).toContain("switchView('nft-analysis', false);");
  });

  it('renders structured NFT causal, token, and chain fields instead of leaving Wave7 JSON hidden', () => {
    expect(html).toContain('function nftProfileAnalysisHtml(profile, sources, publicationDepth = null)');
    expect(html).toContain("['Token model &amp; value capture', profile?.token_model]");
    expect(html).toContain("['Chain dependence', profile?.chain_dependence]");
    expect(html).toContain("['Risk evidence', profile?.risks]");
    expect(html).toContain("['Why this outcome · legacy profile field', profile?.why]");
    expect(html).toContain("['Strategic choices · legacy profile field', profile?.strategic_choices]");
    expect(html).toContain("['Counterfactual · legacy profile field', profile?.counterfactual]");
    expect(html).toContain("['What would change our mind · legacy profile field', profile?.watch]");
    expect(html).toContain("['Material unknowns · legacy profile field', profile?.unknowns]");
    expect(html).toContain("forensicAnalysisHtml(profile?.forensic_analysis, resolveRef");
    expect(html).toContain('${nftProfileAnalysisHtml(p, citedSources, depth)}');
    expect(html).toContain('${nftEvidenceHtml(p, citedSources, c.freshness, depth)}');
    expect(html.match(/\$\{nftLifecycleReadHtml\(p, depth\)\}/g)).toHaveLength(2);
    expect(html).toContain('High-risk field conclusion withheld.');
  });
});
