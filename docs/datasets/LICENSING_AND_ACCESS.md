# ISLRTC Licensing and Access Audit

Audit date: 2026-07-19

This document is an engineering governance record, not legal advice.

## Locally supplied CSV

- Expected local source: `data/imports/islrtc/ISL_Dictionary_words.csv`
- SHA-256: `51ec265c5e5813ac04afacc5d5bfc89a6f5de313327b526187634638fbf1e19b`
- Rows: 28
- Columns: `Sr.No.`, `Folder Name`, `Link`
- Content: one root Google Drive folder, folders A–Z, and a Numbers folder.
- Important: despite its filename, this CSV contains no dictionary words or video metadata.

The catalog is not distributed in the public repository. A schema-only example is available at
`resources/datasets/ISL_Dictionary_words.example.csv`. The original catalog does not establish
permission to redistribute the files linked by it.

## ISLRTC official dictionary

Official references:

- https://islrtc.nic.in/faq/
- https://islrtc.nic.in/copyright-policy/
- https://www.data.gov.in/catalog/indian-sign-language-dictionary

The ISLRTC FAQ states that dictionary data may be used for research, teaching, and development of ISL-related technology when it is not resold or used for profiteering and ISLRTC is properly acknowledged. The same website's copyright policy says website content may not be reproduced partially or fully without permission from DEPwD.

The data.gov.in catalog identifies the dictionary under NDSAP/Government Open Data terms, but at audit time the catalog exposed no downloadable resource or working catalog API. It therefore did not provide a technically usable vocabulary payload.

Decision: `conditional`. SignVerse may index user-provided dictionary exports for non-profiteering technology development with attribution, but automated redistribution of ISLRTC media is disabled until the project records explicit permission or a resource-specific open-data license.

## ISLRTC Google Drive

- Root folder: https://drive.google.com/drive/folders/1U-Pr4r1-cupgNOOq9NH_uTsQnPSVEKco
- Anonymous access check: HTTP 200; page title `ISL Dictionary – Google Drive`.
- The official FAQ identifies this folder as a free access route.

Public readability is not equivalent to a redistribution license. The importer therefore does not
crawl, scrape, download, or redistribute this folder.

## Manual permission-gated workflow

1. Obtain written confirmation covering the intended use and redistribution model, or keep all media outside Git in an access-controlled local directory.
2. Place an authorized catalog at `data/imports/islrtc/ISL_Dictionary_words.csv` and download or
   export media using the official Google Drive UI under the authorized account.
3. Preserve the original filenames and directory structure.
4. Record source URL, permission reference, attribution, license conditions, version/date, and reviewer in the dataset configuration.
5. Run the SignVerse importer in dry-run mode.
6. Review duplicate, metadata, linguistic, and media-quality findings.
7. Promote only approved candidates; run the existing animation converter afterward.

Required acknowledgement for ISLRTC-derived records:

> Indian Sign Language Research and Training Centre, Department of Empowerment of Persons with Disabilities, Ministry of Social Justice and Empowerment, Government of India.
