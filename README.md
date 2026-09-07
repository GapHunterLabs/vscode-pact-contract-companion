# Pact Contract Companion (VS Code)

Lists consumer-provider [Pact](https://pact.io) contract files in your
workspace in a sidebar tree, and flags two real, static issues per
interaction — no Pact Broker, no network call, no live verification
run required.

**v0.1, new niche.** Not a port from the Gap Hunter Labs IntelliJ-
family catalog. Evidence: no VS Code extension inspects Pact contract
files for authoring issues at rest — existing Pact tooling for editors
targets running consumer/provider tests, not reviewing the `.json`
contract files already checked into (or generated into) the workspace.

## Real schema, not a guess

The two Pact contract shapes this extension parses were verified
against real, captured example files fetched directly from GitHub (not
a paraphrased description): a **spec v2** fixture from
`gitlabhq/gitlabhq` (singular `providerState` string) and a **spec
v3** fixture from `pact-foundation/pact_broker` (`providerStates`
array of `{name, params}`). Both forms are normalized to the same
internal shape.

## What it does

A **Pact Contracts** view in the Explorer sidebar lists every file
matching `pactContractCompanion.contractGlob` (default:
`**/pacts/**/*.json`) that actually looks like a Pact contract
(has `consumer`, `provider`, and `interactions`) — other JSON files
matching the glob are silently skipped, not treated as errors. Each
contract shows its interaction count and expands to show two kinds of
finding:

- **No provider state declared.** Not inherently wrong — plenty of
  real requests need no precondition — but worth a glance, since it's
  a common oversight when a provider's response actually does depend
  on state nobody wrote down.
- **Duplicate interaction** (same description + same provider state
  appearing more than once in one contract file). This is not a
  cosmetic nit: Pact's own mock-service matching uses the
  (description, provider state) pair as an interaction's identity, so
  a duplicate pair means one of the two interactions silently
  overwrote the other — it looks like two tests exist, but only one
  ever actually ran.

## v0.1 scope, honestly noted

- **Static analysis of contract files already on disk only.** No
  connection to a Pact Broker, so it can't tell you whether a contract
  has actually been verified by the provider yet — that would need a
  broker (or CI-published) connection this v0.1 doesn't make.
- Two checks, not the full range of things a linter for Pact contracts
  could eventually catch (e.g. matching-rule sanity, response-shape
  drift between versions of the same contract).

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

To build an installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
