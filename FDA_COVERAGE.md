# FDA Drug Approvals & Databases - Coverage Map

Reference: <https://www.fda.gov/drugs/development-approval-process-drugs/drug-approvals-and-databases>

## Supported

These FDA databases are currently accessible via the openFDA API and implemented as MCP tools.

| FDA Database                 | MCP Tool                     | openFDA Endpoint         |
| ---------------------------- | ---------------------------- | ------------------------ |
| Drugs@FDA                    | `search_drugs_at_fda`        | `/drug/drugsfda.json`    |
| Drug Shortages               | `search_drug_shortages`      | `/drug/shortages.json`   |
| FAERS (Adverse Events)       | `search_drug_adverse_events` | `/drug/event.json`       |
| National Drug Code Directory | `search_drug_ndc`            | `/drug/ndc.json`         |
| Drug Labels (SPL)            | `search_drug_labels`         | `/drug/label.json`       |
| Drug Recalls / Enforcement   | `search_drug_recalls`        | `/drug/enforcement.json` |

## Not Supported

### Not available via openFDA API

These databases have their own web interfaces and are not exposed through `api.fda.gov`. Adding support would require scraping, separate APIs, or bulk data downloads.

| FDA Database                                 | Description                                                         | Notes                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Orange Book                                  | Approved drug products with therapeutic equivalence evaluations     | Has downloadable data files at <https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files> |
| Purple Book                                  | Licensed biological products, biosimilars, interchangeable products | Web-only at <https://purplebooksearch.fda.gov/>                                                                |
| Approved REMS                                | Risk Evaluation and Mitigation Strategies                           | Web-only at <https://www.accessdata.fda.gov/scripts/cder/rems/>                                                |
| Dissolution Methods Database                 | Dissolution testing methods for pharmaceutical products             | Web-only                                                                                                       |
| Drug Establishments                          | Registered drug manufacturing facilities                            | Web-only                                                                                                       |
| Drug Safety-related Labeling Changes (SrLC)  | Safety-related modifications to drug labels                         | Web-only                                                                                                       |
| Inactive Ingredient Search                   | Non-active components in approved drugs                             | Web-only                                                                                                       |
| Medication Guides Search                     | Patient-focused medication information                              | Web-only                                                                                                       |
| OTC Monographs@FDA                           | Over-the-counter drug monograph information                         | Web-only                                                                                                       |
| Outsourcing Facility Product Report          | Compounded drug product listings                                    | Web-only                                                                                                       |
| Postmarketing Requirements Database          | Post-approval commitments and requirements                          | Web-only                                                                                                       |
| PEPFAR Database                              | AIDS relief program drug information                                | Web-only                                                                                                       |
| Product-Specific Guidances for Generic Drugs | Development guidance for generics                                   | Web-only                                                                                                       |
| Bioresearch Monitoring (BMIS)                | Bioresearch monitoring data                                         | Web-only                                                                                                       |
| Wholesale Distributor Reporting              | Drug supply chain documentation                                     | Web-only                                                                                                       |

### Additional FDA resources (not databases)

- Compilation of new molecular entity approvals
- Novel drug approval announcements
- Drug approval activity reports
- Weekly approval summaries
- Drug trial snapshots
- Oncology approval notifications
- FDALabel and FDA Online Label Repository

## Potential Additions

The **Orange Book** is the most feasible addition since FDA provides downloadable data files. This could be implemented as a bulk data import or periodic sync rather than a live API call.
