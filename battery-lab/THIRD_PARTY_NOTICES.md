# Third-party notices

This project uses dependencies through their installed Python packages; it does not claim their algorithms as original research.

| Component | Version | License / source |
|---|---|---|
| BLAST-Lite | 1.1.0 | BSD-3-Clause per upstream LICENSE; [project](https://github.com/NatLabRockies/BLAST-Lite), [license](https://github.com/NatLabRockies/BLAST-Lite/blob/main/LICENSE), [notice](https://github.com/NatLabRockies/BLAST-Lite/blob/main/NOTICE) |
| FastAPI | 0.115.12 | MIT; https://github.com/fastapi/fastapi |
| Uvicorn | 0.34.2 | BSD-3-Clause; https://github.com/encode/uvicorn |
| NumPy | 2.2.6 | BSD-3-Clause; https://github.com/numpy/numpy |
| Pydantic / Starlette | See lock file | MIT / BSD-3-Clause; installed metadata retains license information |
| Pytest / HTTPX / Playwright | See development requirements | MIT / BSD-3-Clause / Apache-2.0; test dependencies |

BLAST-Lite attribution: Paul Gasper and contributors; upstream license identifies Copyright (c) 2023, Alliance for Energy Innovation, LLC. The package metadata classifier and repository license may differ; consult the upstream LICENSE and NOTICE, not the classifier alone. No endorsement by the laboratory, DOE, Apple or any vehicle maker is implied.

The NMC-Gr B1 model identifies experimental research at https://doi.org/10.1016/j.est.2023.109042. Its calibrated coefficients are used through the package without modification. The app adds scheduling, energy accounting, applicability checks and visualization.

Apple and US Department of Energy pages are cited as evidence; their logos, product images and article contents are not copied into the application. All browser charts and interface assets are local application code. Transitive dependency versions appear in `requirements-lock.txt`; their installed distributions retain their own licensing terms.

AI assistance: Codex assisted with implementation, documentation and test execution. Team members remain responsible for explaining the model, sources, assumptions and validation status at the event.
