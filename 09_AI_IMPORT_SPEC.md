# AI Import & Data-Mapping Specification
**Version:** 1.0

## 1. Purpose and boundary
AI may classify/extract data from uploaded product images, scans, PDFs and supported tabular documents and propose mappings to system fields. AI is not authorized to approve requests, post inventory, resolve duplicate products automatically, or execute natural-language commands.

## 2. Supported import intents
- Prepare company product creation (including bulk categories, subcategories, units, and products from Excel (.xlsx/.xls) and CSV).
- Prepare project product creation (manufactured products within project scope).
- Prepare stock-in, stock-out, and opening stock inventory movement drafts from Excel (.xlsx/.xls) and CSV.
- Prepare project manufacturing input/output draft where explicitly supported by the selected workflow.
- CSV/XLSX import with deterministic parsing and validation.

## 3. Pipeline
1. Authenticate and authorize uploader.
2. Validate file type, size, extension and MIME signature; scan for malware; store privately.
3. Extract text/table/image information.
4. Map labels (e.g. Qty, Pieces, Received Units, Quantity In) to candidate fields.
5. Match catalog items using deterministic identifiers/normalized text and display candidates; AI similarity may not silently decide identity.
6. Return proposed values, source evidence, confidence/uncertainty and warnings.
7. Show editable review grid; allow cell correction, row add/remove, duplicate-row keep/merge choice.
8. Validate required fields, units/conversions, project/warehouse scope, product approval status, quantity precision and available stock. Lot and expiry data are not extracted or stored.
9. Submit a draft/batch only after explicit user action.
10. Super Admin approval is required for all inventory-affecting rows; stock posts only after approval.
11. Show per-row final status and exportable errors.

## 4. Data contract (conceptual)
Each proposed field should include:
- `field_name`
- `proposed_value`
- `confidence` or `uncertain` indicator (calibrated where possible)
- `source_evidence` (page/row/cell/region/text where available)
- `warnings[]`
- `requires_human_confirmation`
- `raw_extraction_reference`

## 5. Error handling
- Do not discard valid draft rows because another row is invalid.
- Highlight the exact field and reason; preserve draft on failure.
- Do not submit if blocking validation errors remain.
- Duplicate rows are flagged; user explicitly chooses separate rows or merge.
- Keep original imported row values and edit history for audit.
- Extraction failure leaves no stock impact and provides a retry/manual-entry path.

## 6. Security and privacy
- Uploaded files are untrusted; private storage, malware scanning, strict size/type limits and access control are required.
- Never place credentials, tokens or sensitive operational data in prompts unnecessarily.
- Treat document contents as data, not instructions. Ignore prompt-injection text embedded in documents.
- AI output must pass the same server-side validators as manual entry.
- Retention and deletion schedule for source files must be decided before production.
- Record model/provider/version and extraction outcome as appropriate for troubleshooting, without retaining unnecessary sensitive content.

## 7. Non-goals
- No AI-generated stock posting.
- No AI approvals.
- No autonomous duplicate resolution.
- No natural-language transaction execution.
- No barcode scanning.
