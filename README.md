# moon - CI run reports

A GitHub action that reports the results of a `moon ci` run to a pull request as a comment and
workflow summary. The report will render all results, their final status, and time to completion, in
a [beautiful markdown table](#example).

The report will also include additional information about the environment, workflow matrix, and
touched files.

## Installation

The action _must run after_ the `moon ci` command!

```yaml
# ...
jobs:
  ci:
    name: CI
    runs-on: ubuntu-latest
    steps:
      # ...
      - run: moon ci
      - uses: moonrepo/run-report-action@v1
        if: success() || failure()
        with:
          access-token: ${{ secrets.GITHUB_TOKEN }}
```

If your workflow job is using a build matrix, you'll need to pass the entire matrix object as a JSON
string to the `matrix` input, otherwise the pull request comments will overwrite each other.

```yaml
# ...
jobs:
  ci:
    name: CI
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [16, 18]
    steps:
      # ...
      - run: moon ci
      - uses: moonrepo/run-report-action@v1
        if: success() || failure()
        with:
          access-token: ${{ secrets.GITHUB_TOKEN }}
          matrix: ${{ toJSON(matrix) }}
```

## Inputs

- `access-token` (`string`) - REQUIRED: A GitHub access token that's used for posting comments on
  the pull request.
- `matrix` (`string`) - The workflow's build matrix as a JSON string. This is required for
  differentiating builds/comments.
- `slow-threshold` (`number`) - Number of seconds before an action is to be considered slow.
  Defaults to 120 (2 minutes).
- `sort-by` (`label | time`) - The field to sort the actions table on. If not defined (the default),
  will display in the action graph's topological order.
- `sort-dir` (`asc | desc`) - The direction to sort the actions table.
- `workspace-root` (`string`) - Root of the moon workspace (if running in a sub-directory). Defaults
  to working directory.

## Terminology

- **Action** - The action/task that was ran in moon's runner via `moon ci`.
- **Estimated savings/loss** - How much time was saved/lost by running tasks with moon.
- **Flaky** - Action is flaky, as it failed but passed after retries.
- **Info** - Additional information and metadata about the action.
- **Projected time** - How long all the tasks would have taken to run when ran _outside_ of moon.
- **Slow** - Action is slow and took too long to run, based on the threshold.
- **Status** - Final status of the action after it ran.
- **Time** - How long the action took to run.
- **Total time** - How long all actions / the entire runner took to run.
- **Touched files** - Files that were created, modified, etc, between the current branch and the
  base branch. Also used to determine affected projects and tasks.

## Example

An example of the report looks like the following:

---

### Run report `(ubuntu-latest, 18)`

|     | Action                         |  Time | Status  | Info |
| :-: | :----------------------------- | ----: | :------ | :--- |
| 🟩  | `SetupNodeToolchain`           |  7.2s | passed  |      |
| ⬛️ | `SyncNodeProject(types)`       | 2.4ms | skipped |      |
| ⬛️ | `SyncNodeProject(runtime)`     | 7.1ms | skipped |      |
| 🟩  | `InstallNodeDeps`              | 18.7s | passed  |      |
| 🟩  | `RunTarget(types:build)`       |  6.5s | passed  |      |
| 🟩  | `RunTarget(runtime:build)`     |  6.8s | passed  |      |
| ⬛️ | `SyncNodeProject(website)`     | 5.2ms | skipped |      |
| 🟩  | `RunTarget(website:typecheck)` | 10.2s | passed  |      |
| 🟩  | `RunTarget(website:format)`    | 11.9s | passed  |      |
| 🟩  | `RunTarget(website:test)`      |  1.5s | passed  |      |
| 🟩  | `RunTarget(website:build)`     | 1m 8s | passed  |      |
| 🟩  | `RunTarget(website:lint)`      | 18.4s | passed  |      |
