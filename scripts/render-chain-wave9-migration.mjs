import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../docs/top50-chain-dossiers-wave9-2026-07-29.json', import.meta.url);
const destination = new URL('../migrations/0050_chain_dossiers_wave9.sql', import.meta.url);
const payload = JSON.stringify(JSON.parse(readFileSync(source, 'utf8'))).replaceAll("'", "''");
const sql = `-- Live-snapshot correction: ranks 41-45 from Chaindump's 2026-07-29 top-50 board.
-- Generated from docs/top50-chain-dossiers-wave9-2026-07-29.json.
WITH seed(payload) AS (VALUES ('${payload}')),
dossiers AS (SELECT value dossier FROM seed, json_each(seed.payload)),
dimension_rows AS (
 SELECT json_extract(dossier,'$.chain') chain, dimensions.key dimension, dimensions.value data,
   (SELECT json_group_array(json(json_extract(dossier,'$.source_catalog.'||source_keys.value)))
    FROM json_each(json_extract(dossier,'$.dimension_sources.'||dimensions.key)) source_keys) sources
 FROM dossiers, json_each(json_extract(dossier,'$.dimensions')) dimensions
),
meta_rows AS (
 SELECT json_extract(dossier,'$.chain') chain, '_meta' dimension, json_extract(dossier,'$.meta') data,
   (SELECT json_group_array(json(value)) FROM json_each(json_extract(dossier,'$.source_catalog'))) sources
 FROM dossiers
)
INSERT OR REPLACE INTO chain_facts(chain,dimension,data,sources,updated_at)
SELECT chain,dimension,data,sources,'2026-07-29' FROM dimension_rows
UNION ALL SELECT chain,dimension,data,sources,'2026-07-29' FROM meta_rows;
`;
writeFileSync(fileURLToPath(destination), sql);
