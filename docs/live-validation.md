# Live evidence validation

These checks ran on October 24, 2026 (Pacific time), against the `feat/evidencesources` implementation.
Live source retrieval, automatic verdicts, browser UI execution, and mocked regression tests are
reported separately. No certificate verification was disabled.

## Real evidence APIs and pages

| Source | Live result | What was established |
|---|---|---|
| Wikipedia | Four relevant passages retrieved | Search and article-extract API requests work |
| Wikidata | Four structured statements retrieved | Search, entity data, labels, date precision and source links work |
| Europe PMC | Four abstract passages retrieved | Search and abstract extraction work; this does not independently validate the research conclusions |
| Crossref (since removed) | Exact paper retrieved | *Deep Residual Learning for Image Recognition*, DOI `10.1109/cvpr.2016.90`, publication date June 2016 |
| World Bank | One dated observation retrieved | India, total population, 2023: `1438069596` people, as returned by the API during the run |
| GOV.UK | Four official guidance passages retrieved | The first-adult-passport guide states: “An adult passport is valid for 10 years.” |
| NASA trusted URL | Four page passages retrieved | Mars facts states: “Mars has two small moons, Phobos and Deimos, that may be captured asteroids.” |

Source links: [Wikidata opening date](https://www.wikidata.org/wiki/Q243#P1619),
[Crossref paper](https://doi.org/10.1109/cvpr.2016.90),
[World Bank observation](https://data.worldbank.org/indicator/SP.POP.TOTL?locations=IN),
[GOV.UK guidance](https://www.gov.uk/apply-first-adult-passport/who-can-apply-how-long-it-takes),
[NASA facts](https://science.nasa.gov/mars/facts/).

World Bank can revise observations. The recorded value is evidence of the actual response during
this run, rather than a constant embedded in application code.

## Automatic verdicts with real retrieved evidence

The built SDK, live Wikidata provider and offline heuristic produced:

| Input | Observed verdict | Observed correction |
|---|---|---|
| The Eiffel Tower opened in 1899. | Contradicted | The Eiffel Tower opened in 1889. |
| The Eiffel Tower opened in 1889. | Supported | None |
| Albert Einstein was born in 1878. | Contradicted | Albert Einstein was born in 1879. |

Each deciding verdict cited an exact substring of the retrieved statement and linked to the
corresponding Wikidata property. These are literal checks, not a benchmark of hosted-model quality.

The actual standalone CLI also completed the Eiffel Tower check through the cloud's configured
HTTPS proxy, with no API key, no provider errors, the correct 1889 correction and the Wikidata
`P1619` citation. Reproduce from the repository root after `pnpm build`:

```bash
node packages/cli/dist/hf-verify.mjs verify --answer - --wikidata --format json <<'EOF'
The Eiffel Tower opened in 1899.
EOF
```

The standalone CLI also checked “An adult UK passport is valid for 20 years.” against live
GOV.UK content. It returned `contradicted`, quoted “An adult passport is valid for 10 years.”,
linked to the first-adult-passport guide, and produced the grounded correction
“An adult UK passport is valid for 10 years.”

The release ZIP was then extracted outside the checkout, without installing package dependencies.
Its standalone CLI repeated the live Eiffel Tower check successfully, including the source citation
and 1889 correction.

## Real Chromium UI execution

The built offline demo ran in Chromium. It reported three checked claims, two supported and one
contradicted, with zero JavaScript errors. Clicking the contradicted claim opened the evidence panel
with the exact quote, source link and correct 1902 founding-year correction. This demo deliberately
uses fictional supplied documents and `MockLLM`; it is a UI check, not live web evidence or a
hosted-model test.

## Fixes found by live testing

- GOV.UK uses an empty `withdrawn_notice` object for active pages. Treating any object as a withdrawal
  discarded valid evidence. Empty notices are now accepted; actual withdrawal notices remain excluded.
- GOV.UK searches the claim's subject instead of sending its false number and complete assertion.
- Crossref title searches exclude the asserted year and retain the exact paper instead of a similarly
  named survey or derivative work.
- Trusted HTML pages use main/article content instead of global navigation. Numeric coincidences
  have less retrieval weight than the actual subject and property.
- Precise Wikidata dates retain full precision while supplying a directly citable year statement.
  Numeric claims prefer an equally relevant numeric statement over a place/name-only statement.
- Node 20's default fetch did not honor the configured proxy. The CLI now bundles proxy support and
  respects `NO_PROXY`, without changing TLS verification.

## Still untested live

- Tavily, Google Fact Check and Brave requests require user API keys that were not configured.
- Hosted model verification requires a model API key, or an available local model server. Neither
  was available. Scientific/metadata/NASA retrieval success therefore must not be described as a
  successful automatic semantic verdict for those claims.
- The managed browser blocks installation of unpacked extensions. The extension was built and its
  logic tested, but loading it into a live ChatGPT session remains unverified in this environment.

Keys can be entered securely in the cloud environment settings for further integration checks;
they must not be pasted into chat or committed to the repository.

## Automated validation after the fixes

All 184 tests passed with fake fetch in the original feature suites. After integrating the latest
`main` (including its ChatGPT, skill and Wikipedia regression tests), all 200 tests passed under
Vitest 4.1.11. Build, type checking, frozen-lockfile installation and release packaging passed.
The offline benchmark remained at 89.2% on its existing
37 synthetic claims (four misses); that result is not a measure of real-world or hosted-model accuracy.

> **Note:** Crossref was removed as an evidence source after this validation run, so its results above are historical only.
