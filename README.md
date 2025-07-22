# OpenFn Adaptors ![Build & Test](https://github.com/openfn/adaptors/actions/workflows/ci.yaml/badge.svg?branch=main) ![Build & Test](https://github.com/openfn/adaptors/actions/workflows/docs.yaml/badge.svg?branch=main)

The new home for all @openfn
[language adaptors](https://docs.openfn.org/adaptors) - open-source Javascript
or Typescript modules that provide helper functions to communicate with a
specific external system.

For a fully open source workflow automation platform that leverages these
adaptors, see [OpenFn Lightning](https://github.com/OpenFn/lightning).

## Getting Started

_Note: [asdf](https://github.com/asdf-vm/asdf) to be installed globally on your
machine. Add the nodejs and pnpm plugin once asdf is installed globally._

A few first time repo steps:

```
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
asdf plugin-add pnpm
```

Then:

```
asdf install # Install tool versions
pnpm install
pnpm build
pnpm run setup
```

## Running scripts

Every repo provides a common set of npm scripts:

To run them for all scripts in `packages`, call
`pnpm --filter "./packages/** <script>`.

For example:

```
pnpm --filter "./packages/**" build
pnpm --filter "./packages/**" test
```

## Contributing

### Assign yourself to an issue

Read through the existing [issues](https://github.com/OpenFn/adaptors/issues)
and assign yourself to the issue you have chosen. If anything needs
clarification, don't hesitate to leave a comment on the issue and we will get
back to you as soon as possible.

If there isn't already an issue for the feature you would like to contribute,
please make one and assign yourself.

### Open a pull request

1. Clone the adaptors repository, then
   [fork it](https://docs.github.com/en/get-started/quickstart/fork-a-repo).

2. Make your changes by following the
   [working with adaptors](#working-with-adaptors) section.

3. Open a draft PR, fill out the pull request template (this will be added
   automatically for you) then make sure to self-review your code and go through
   the 'Review checklist'. Leave any notes for the reviewer in the 'Details'
   section.

4. Mark the pull request as ready for review, and assign @stuartc or
   @taylordowns2000.

### Working with adaptors

#### Requirements

- Create a fork of this repo on your local machine
- Iinstall the OpenFn CLI `npm install -g @openfn/cli`
- Ensure the OPENFN_REPO_DIR env var is set to to the root of this repo, ie,
  `export OPENFN_REPO_DIR=~/repo/openfn/cli-repo`
- Ensure you have the logo images of the adaptor you need to create: a rectangle
  512x190px and a square-256x256px

#### 1. Setup

Generating a new adaptor. Run this from the repo root:

```
pnpm generate <adaptor-name>
```

- Add the logo images in the assets folder inside the generated adaptor folder.
  Ps: Ensure both images are named rectangle.png and square.png respectively and
  adhere to the size specifications mentioned in the requirements section.
- Ensure the mages have a transparent background. Navigate to
  configuration-schema.json, and change any configs that do not align with the
  adaptor
- Go to `/src/Adaptor.js` and create the adaptor’s Operations - the functions
  used in job code. You may want to set up `POST, GET,` to fit the current
  adaptor’s requirements

They should look something like this:

```js
export function yourFunctionName(arguments) {
  return state => {
    // logic
    return state;
  };
}
```

- Go to `src/Utils.js` and change the code in the file to match your desired
  implementation. Any internal functions used by your adaptor, but not by job
  code, should go here in Utils.js
- Update the readme with correct examples that match your new implementation
- Write and update the tests within the `/tests` folder
- Edit the CHANGELOG.md file with comments about the initial release.
- You should set your credentials in the “configuration” property inside
  `state.json`
- Write some unit tests to ensure your code works

#### 2. Test it manually

To run a test job and exercise your

- Create a new /tmp folder and create two new files: state.json and
  expression.js.
- - Note that the /tmp folder is already gitignored and will not be sent to
    gitHub when you push your code.
- Write a test job inside `expression.js`
- Navigate to the adaptor folder:

```
cd packages/<adaptor name>
```

- Install adaptor dependencies

```
pnpm install
```

- Build the adaptor

```
pnpm build --watch
```

- Run the test job through the CLI

```
openfn tmp/expression.js -ma <adaptor name> -o tmp/output.json -s tmp/state.json

```

`-o` will output to your console

`-m` will run the job from the monorepo (see the setup notes in 1.)

`-a` this will specify the adaptor to run your job with

The different output from you running the jobs will be temporarily stored in
`output.json`

#### 3. Add docs and write the tests

- Include [JSDoc](https://jsdoc.app/) comments to provide a clear and
  comprehensive explanation of the adaptor function's purpose, parameters,
  return values, and usage examples
- Update the adaptor's `README.md` to include a sample operation

## Changesets

Any submitted PRs should have an accompanying
[`changeset`](https://github.com/changesets/changesets).

A changeset is a text file with a list of what you've changed and a short
summary. Changesets are stored in a temporary folder until a release, at which
point they are merged into the changelogs of the affected packges.

Adding a changeset is really easy thanks to a very friendly CLI.

To create a changeset, run this from the repo root:

```
pnpm changeset
```

Look in the `.changesets` folder to see your change.

Commit the changeset to the repo when you're ready.

Note that the newly generated adaptor should ideally never have its version
increased - it should be locked at `1.0.0`.

## Releases

New releases will be published to npm automatically when merging into the `main`
branch`.

Version numbers should be bumped with `changeset` and git tags should be pushed
to the release branch BEFORE merging.

1. Run `pnpm run version` from root to bump versions and add release dates
1. Run `pnpm install`
1. Commit the new version numbers
1. Push the branch

When the branch is merged to main, Github Actions will:

- Build and test (just in case)
- Publish any new version numbers to npm
- Generate and push tags for all new versions
- Send a notification to slack
- Update `docs/docs.json` with new markdown and update docs.openfn.org

## Pre-releases

**NOTE: pre-release automation is currently DISABLED until support is activated
in Lightning**

Pre-release builds for adaptors are available with the `@next` tag. These can be
used in the CLI and Lightning and are generally available on `npm` (but because
they're not flagged as `latest`, they won't be downloaded by default).

Old pre-release versions will be deprecated when a new tag is published.

Pre-releases are available for any non-draft PR with at least one changeset.

The pre-release build will be updated when:

- A PR is opened in a non-draft state
- A new commit is pushed
- A changeset is added

Pre-releases will be given the correct next version number (the number that
`pnpm changeset version` will generated), plus the suffix `-next-<sha>`, where
sha is teh short github SHA for the commit.

Note that the Worker and CLI will both always download the latest versions of
the adaptor with the `@next` tag - it's a rolling tag and should always be up to
date.

## Build tooling

The `build` command accepts a list of build steps as arguments: `ast`, `src`,
`docs` and `dts`. Calling build on an adaptor with no arguments will build
everything.

Add `--watch` to watch the `src` for changes and rebuild this dist. This is
useful when developing with the CLI.

You can also watch with `build docs`, ie:

```
pnpm -C adaptors/http build docs --watch
```

Each adaptor's build command should simply call `build-adaptor` with the package
name.

You can run `build --help` for more information.

Examples:

```
pnpm -C packages/salesforce build --watch
```

### Docs

Docs are generated from the JSDoc annotations in adaptors. They are output as
markdown files in the `./docs` directly and not checked in to source control.

The markdown output can be customized by overriding the built-in handlebars
templates in jsoc2md.

- Find the template you want to customise in [j2sdoc2md source()
  https://github.com/jsdoc2md/dmd/tree/master/partials) (this can be tricky)
- Copy the template contents
- Paste into a file with the same name (this is important) in
  `tools/build/src/partials`
- Edit `tools/build/src/commands/docs.ts` and add the path to your new template
  to jsdoc2md's `renderOpts` (see how the other .hbs files are loaded in)
- Make your changes
- Run `pnpm build docs` from root (or just one adaptor folder) and inspect the
  generated `docs/index/md` file.

Once built, the docs need to be compiled into a JSON file to be published to the
docs site. This is run automatically through github actions.

For local dev against the docsite, you can run `pnpm docs:build` to rebuild your
local `docs.json` file. Use `pnpm docs:watch` to watch for md changes in
packages/\* and rebuild automatically.

## Metadata

Check the Wiki for the metadata creation guide:
[https://github.com/OpenFn/adaptors/wiki/Magic-Metadata](https://github.com/OpenFn/adaptors/wiki/Magic-Metadata)

There are two CLI utils you can run to generate metadata and populate mock data.

Use `generate` to create a metadata.json based on the provided config. This will
be saved to `packages/<adaptorName>/src/meta/metadata.json`.

Use `populate-mock` to execute the `populate-mock-data.js` file and save the
results into the meta/data dir. Unit tests will use this mock data.

```
pnpm metadata generate <adaptorName> <path/to/config> pnpm metadata
populate-mock <adaptorName> <path/to/config>
```

Config paths can point to JSON or JS files with a default export. They are
always specified relative to the adaptor directory.

You can run these from the repo root or from the adaptor folder.

## Migration Guide

Any old adaptors should be copied/cloned into this repo, with all build, lint
and git artifacts removed and the package.json updated.

This checklist walks you through the process.

**IMPORTANT**: before starting the migration process, please make sure all open
pull-requests are merged or closed (maybe discuss with authors / responsibles)

First, create a new branch for your work:

```
git checkout -b migrate\_<name>
```

Then, copy the adaptor into `packages/<name>` (ignoring the `language-` prefix,
ie, `language-http` -> `http`). You can `cd` into `package` and `git clone`
straight from github if you like.

Next, from the `adaptors` root folder, run the migration script:

```
pnpm migrate <name>
```

For example, `pnpm migrate http`.

Then, from inside your new `packages/<name>`:

- Remove the `.git` directory
- Commit your changes `git commit -am "cloned <name> into monorepo"`
- Delete `package-lock.json`
- Remove `bundledDependencies` from package.json
- Make sure `"rimraf": "^3.0.2"` is in `devDependencies`
- Fix index.js (see `index.js` below)
- Run `pnpm install`
- Run `pnpm build`
- Remove the `docs` and `lib` dirs
- Remove `.prettierrc`
- Remove any references to `babel` (ie, `.babelrc`) and `esdoc` (ie,
  `esdoc.json`)
- Remove the `.gitignore` file (update the top level ignore if necessary)
- Remove the `Makefile`
- Remove the `.devcontainer`
- Remove the `.tool-versions`
- Rename `crendential-schema.json` file to `configuration-schema.json`
- Remove the all files related to Travis CI (`travis.yml`, `.travis.yml`, ...)
- Update the readme (see the `Readme` below)
- Fix unit tests (see `Tests` below)
- run `git add packages/<name>` from the root folder to allow pnpm to detect
  `<name>` as changed package
- run `pnpm changeset` from the repo root to register a changeset (add a minor
  version bump for the package).
- Commit your changes, including the changeset, and open a pull request against
  `main`.

**IMPORTANT**:

- Make sure all open issues are transfered to the
  `https://github.com/openfn/adaptors` repositiory and labelled as the name of
  the source adaptor name. For example issues coming from `language-postgres`
  should have the label `postgres`.
- Update the adaptor repository readme to add archive note
- Archive the adaptor if you can
- Update the adaptor readme to indicate where the package has been moved to
  adaptors repo. See example below

```
# _⚠️ MOVED TO [OpenFn/adaptors](https://github.com/OpenFn/adaptors)! ⚠️_

**N.B.: New versions are available at:
https://github.com/OpenFn/adaptors/tree/main/packages/<name>**

# Language <name> (Archived)
```

### index.js

The index.js file should be exactly this:

```

import \* as Adaptor from './Adaptor'; export default Adaptor;

export \* from './Adaptor';

```

The first two lines export the Adaptor object as the default export from the
module, so you can do `import common from '@openfn/common'`

The second line exports every export of Adaptor from the main index, so you can
do `import { fn } from '@openfn/common'`.

### Readme

The readme probably has a section called "Development".

Replace this section with:

```
## Development

Clone the [adaptors monorepo](https://github.com/OpenFn/adaptors). Follow the
`Getting Started` guide inside to get set up.

Run tests using `pnpm run test` or `pnpm run test:watch`

Build the project using `pnpm build`.

To just build the docs run `pnpm build docs`

```

In addition, you may need to replace any references to `npm` with `pnpm`

### Tests

You'll need to update tests and get them passing.

Instead of importing test files from `lib`, import directly from `src`.

Ie, replace `import Adaptor from '../lib/Adaptor'` becomes
`import Adaptor from '../src/Adaptor'`


# OpenFn Custom Adaptors

This project contains custom adaptors for OpenFn with enhanced functionality, particularly for Excel file processing and SFTP operations.

## Architecture

The project is structured as a monorepo with workspace-based dependencies:

- **Source packages**: Located in `packages/` directory
- **Published packages**: Built to `published-adaptors/packages/` directory
- **Workspace context**: Uses npm workspaces for dependency resolution

## Key Features

### Enhanced SFTP Adaptor

- **getXLSX Function**: Streaming Excel file processing with memory optimization
- **Chunked Processing**: Handles large files without memory overflow
- **OpenFn Compliance**: Respects OpenFn's 500MB per-job memory limit
- **Error Handling**: Comprehensive error handling and logging

### Memory Optimization

- Streaming-based processing instead of loading entire files
- Configurable chunk sizes for batch processing
- Memory usage monitoring and compliance checking
- Optimized for large Excel files (1M+ rows)

## Testing

The testing approach builds the full project in workspace context to ensure proper dependency resolution.

### Quick Start

```bash
# Run all tests
./test-excel-chunks.sh

# Run specific test types
./test-excel-chunks.sh build    # Build and verify
./test-excel-chunks.sh unit     # Unit tests only
./test-excel-chunks.sh xlsx     # Excel processing tests
./test-excel-chunks.sh quick    # Quick validation
./test-excel-chunks.sh shell    # Interactive shell
```

### Test Architecture

The testing system uses Docker to create a consistent environment:

1. **Full Project Build**: Builds the entire monorepo in workspace context
2. **Dependency Resolution**: Properly resolves `workspace:*` dependencies
3. **Published Package Testing**: Tests the built packages in their proper context
4. **Memory Testing**: Validates memory usage and compliance

### Test Types

- **build**: Verifies the build process and output structure
- **unit**: Runs unit tests for individual functions
- **xlsx**: Tests Excel processing functionality specifically
- **quick**: Fast validation of build output and basic functionality
- **shell**: Interactive shell for debugging and exploration

## Why This Approach Works

### The Problem with Testing Published Packages

The published packages contain `workspace:*` dependencies that can only be resolved in the original workspace context. Testing them in isolation fails because:

- No workspace resolver available
- Dependencies can't be resolved to actual packages
- They're designed for OpenFn's runtime, not standalone Node.js

### The Solution: Full Project Build

By building the entire project in Docker:

1. **Workspace Context**: Maintains the monorepo workspace structure
2. **Dependency Resolution**: `workspace:*` dependencies are properly resolved
3. **Build Process**: Follows the same process as production builds
4. **Consistent Environment**: Same environment as the actual build system

### Benefits

- **Accurate Testing**: Tests the actual build output, not isolated packages
- **Proper Dependencies**: All dependencies are resolved correctly
- **Memory Testing**: Can test memory usage in realistic conditions
- **CI/CD Ready**: Reproducible in any environment

## Development Workflow

1. **Make Changes**: Edit source code in `packages/` directory
2. **Build**: Run `npm run build` to create published packages
3. **Test**: Use `./test-excel-chunks.sh` to test in proper context
4. **Deploy**: Published packages work correctly in OpenFn environment

## Key Differences from Previous Approach

### Before: In-Place Testing
- Built packages within the source tree
- Tested in the same workspace context
- Simple but mixed source and build artifacts

### Now: Workspace-Aware Testing
- Builds entire project in clean environment
- Tests published packages in proper context
- Separates source and build artifacts
- More accurate representation of production

## Memory Compliance

The adaptors are designed to comply with OpenFn's memory limits:

- **Memory Limit**: 400MB (80% of 500MB OpenFn limit)
- **Chunk Size**: 1000 rows per chunk
- **Monitoring**: Real-time memory usage monitoring
- **Error Handling**: Graceful handling of memory limit violations

## Docker Environment

The Docker setup:
- Uses Node.js 18 (matches OpenFn environment)
- Builds full project with proper workspace context
- Runs tests in consistent environment
- Provides interactive shell for debugging

## Troubleshooting

### Common Issues

1. **Docker Build Failures**: Ensure you're running from the correct directory
2. **Memory Errors**: Check that chunk sizes are appropriate for your data
3. **Import Errors**: Verify that the build process completed successfully

### Debug Mode

Use the shell test type for interactive debugging:

```bash
./test-excel-chunks.sh shell
```

This provides an interactive shell within the Docker container where you can:
- Explore the built packages
- Run individual tests
- Debug import issues
- Check memory usage

## Contributing

1. Make changes to source packages in `packages/`
2. Test changes using the Docker-based test suite
3. Ensure memory compliance and proper error handling
4. Update documentation as needed

## Integration with OpenFn

The published packages are designed to work seamlessly with OpenFn:

- **Runtime Compatibility**: Built for OpenFn's Node.js runtime
- **Memory Compliance**: Respects OpenFn's memory limits
- **Error Handling**: Provides OpenFn-compatible error reporting
- **Dependency Resolution**: Uses OpenFn's dependency resolution system
