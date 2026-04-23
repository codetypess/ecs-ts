# Releasing

Use this checklist before the first public publish and before every subsequent release.

## Manual Checks

- Confirm the target registry package name is `@codetypess/ecs-ts`, and update this checklist if the publish target changes later.
- Add a `LICENSE` file and a matching `license` field in `package.json` before the first public open-source release.
- Review the version in `package.json` and bump it to the intended release version.
- Skim `README.md` and `README-en.md` to make sure examples and wording still match the current API.

## Automated Validation

Run the full release gate:

```sh
npm run release:check
```

That command runs:

- static checks
- unit tests
- example validation
- benchmark smoke
- clean build
- package self-reference smoke test
- `npm pack --dry-run`

## Package Review

Inspect the dry-run tarball output and verify:

- only the intended docs and build artifacts are included
- no stale files remain in `dist`
- the package root import works through the built `exports`

## Publish

When everything above is green:

```sh
npm publish
```

After publish, verify the installed package from a clean project before announcing the release.
