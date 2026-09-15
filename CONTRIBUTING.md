# Contributing to Vislang

Thanks for looking at the repo.

Vislang 0.1 is a Git-native constitution format plus a small reference tool:

- `validate` — is this document a legal 0.1 constitution?
- `diff` — what did the constitution change mean?
- `init` — write a legal starter `vislang.json`

The v0.1 language and toolchain scope is **frozen**. Most useful contributions right now are bug fixes, tests, documentation accuracy, and evidence from using Vislang on real repositories.

## Setup

Requirements:

- Node.js 22+

```bash
git clone https://github.com/aydanmoussa74-a11y/vislang.git
cd vislang
npm install
```

## Run tests

```bash
npm test
```

Useful slices:

```bash
npm run test:schema
npm run test:validate
npm run test:diff
npm run test:semver
npm run test:cli
```

The suite should stay green. Do not weaken or delete tests to land a change.

## Run the CLI

From the repository root:

```bash
npm run vislang -- --help
npm run vislang -- init
npm run vislang -- validate vislang.json
npm run vislang -- diff old.json new.json
```

You can also run:

```bash
node --experimental-strip-types src/cli.ts --help
```

## What belongs in a change

Keep pull requests focused.

Implementation bugs
: Fix the code and add a regression test. Do not rewrite `SPEC.md` to match a bug.

Specification / language changes
: Changing `spec/0.1/SPEC.md` or `spec/0.1/schema.json` is a language change. That is not the same as an implementation fix. Open discussion first. v0.1 is frozen; do not add predicates, YAML, adapters, evidence/`check`, or new CLI commands in a drive-by PR.

Docs
: Correct descriptions of behavior that already exists. Do not document features that are not implemented.

## Tests for behavioral changes

If you change validation, DTCG boundary handling, semantic diff, SemVer policy, CLI output, or exit codes, add a focused test that would have failed before the fix.

Do not add large fixture dumps without a reason.

## Pull requests

- One concern per PR
- Describe the observed behavior, the expected spec rule, and the test
- Leave implementation, spec, and docs distinguishable in the description
- Do not mix license/docs polish with parser changes unless that is the whole PR

## Security

See [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.
