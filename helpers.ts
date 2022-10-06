import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Action, ActionStatus, Duration, RunReport } from '@moonrepo/types';

export function getCommentToken() {
	return `<!-- moon-run-report: ${core.getInput('matrix') || 'unknown'} -->`;
}

export function getCommitInfo() {
	const { repo, serverUrl, sha } = github.context;

	if (!sha || !repo) {
		return null;
	}

	return {
		sha,
		url: `${serverUrl}/${repo.owner}/${repo.repo}/commit/${sha}`,
	};
}

export function getDurationInMillis(duration: Duration): number {
	return duration.secs * 1000 + duration.nanos / 1_000_000;
}

export function getIconForStatus(status: ActionStatus): string {
	switch (status) {
		case 'cached':
			return '🟪';
		// case 'cached-remote':
		// 	return '🟦';
		case 'failed':
		case 'failed-and-abort':
			return '🟥';
		case 'invalid':
			return '🟨';
		case 'passed':
			return '🟩';
		default:
			return '⬛️';
	}
}

export function getMoonEnvVars() {
	const env: Record<string, string> = {};
	let count = 0;

	Object.entries(process.env).forEach(([key, value]) => {
		if (key.startsWith('MOON_') && value) {
			env[key] = value;
			count += 1;
		}
	});

	if (count === 0) {
		return null;
	}

	return env;
}

export function hasFailed(status: ActionStatus): boolean {
	return status === 'failed' || status === 'failed-and-abort';
}

export function hasPassed(status: ActionStatus): boolean {
	return status === 'passed' || status === 'cached';
}

export function isFlaky(action: Action): boolean {
	if (!action.attempts || action.attempts.length === 0) {
		return false;
	}

	return hasPassed(action.status) && action.attempts.some((attempt) => hasFailed(attempt.status));
}

export function isSlow(action: Action, slowThreshold: number): boolean {
	if (!action.duration) {
		return false;
	}

	const millis = getDurationInMillis(action.duration);
	const threshold = slowThreshold * 1000; // In seconds

	return millis > threshold;
}

export function formatTime(mins: number, secs: number, millis: number): string {
	if (mins === 0 && secs === 0 && millis === 0) {
		return '0s';
	}

	const format = (val: number) => {
		let v = val.toFixed(1);

		if (v.endsWith('.0')) {
			v = v.slice(0, -2);
		}

		return v;
	};

	// When minutes, only show mins + secs
	if (mins > 0) {
		let value = `${mins}m`;

		if (secs > 0) {
			value += ` ${secs}s`;
		}

		return value;
	}

	// When seconds, only show secs + first milli digit
	if (secs > 0) {
		return `${format((secs * 1000 + millis) / 1000)}s`;
	}

	// When millis, show as is
	if (millis > 0) {
		return `${format(millis)}ms`;
	}

	// How did we get here?
	return '0s';
}

export function formatDuration(duration: Duration | null): string {
	if (!duration) {
		return '--';
	}

	if (duration.secs === 0 && duration.nanos === 0) {
		return '0s';
	}

	let mins = 0;
	let { secs } = duration;
	const millis = duration.nanos / 1_000_000;

	while (secs >= 60) {
		mins += 1;
		secs -= 60;
	}

	return formatTime(mins, secs, millis);
}

export function calculateSavingsPercentage(projected: Duration, savings: Duration) {
	const base = getDurationInMillis(projected);
	const diff = getDurationInMillis(savings);

	return Math.round((diff / base) * 100);
}

export function createCodeBlock(map: Record<string, unknown> | string[]): string[] {
	const code = ['```'];

	if (Array.isArray(map)) {
		code.push(...map);
	} else {
		Object.entries(map).forEach(([key, value]) => {
			code.push(`${key} = ${value}`);
		});
	}

	code.push('```');

	return code;
}

export function createDetailsSection(title: string, body: string[]): string[] {
	return [
		'',
		`<details><summary><strong>${title}</strong></summary><div>`,
		'',
		...body,
		'',
		'</div></details>',
	];
}

export function formatTotalTime({
	duration,
	projectedDuration,
	estimatedSavings,
}: RunReport): string {
	const parts = [`Total time: ${formatDuration(duration)}`];

	if (projectedDuration) {
		parts.push(`Projected time: ${formatDuration(projectedDuration)}`);

		if (estimatedSavings) {
			const percent = calculateSavingsPercentage(projectedDuration, estimatedSavings);

			if (percent > 0) {
				parts.push(`Estimated savings: ${formatDuration(estimatedSavings)} (${percent}% decrease)`);
			} else {
				parts.push(
					`Estimated loss: ${formatDuration(estimatedSavings)} (${Math.abs(percent)}% increase)`,
				);
			}
		}
	}

	return parts.join(' | ');
}

export interface FormatReportOptions {
	limit: number;
	slowThreshold: number;
	workspaceRoot: string;
}

// eslint-disable-next-line complexity
export function formatReportToMarkdown(
	report: RunReport,
	{ limit, slowThreshold, workspaceRoot }: FormatReportOptions,
): string {
	const commit = getCommitInfo();
	const matrix = core.getInput('matrix');
	const matrixData = matrix ? (JSON.parse(matrix) as Record<string, unknown>) : null;

	const markdown = [
		getCommentToken(),
		'',
		commit ? `## Run report for [${commit.sha.slice(0, 8)}](${commit.url})` : '## Run report',
	];

	if (matrixData) {
		markdown[2] += ` \`(${Object.values(matrixData).join(', ')})\``;
	}

	if (report.duration) {
		markdown.push(formatTotalTime(report));
	}

	// ACTIONS

	const tableHeaders = [
		'|     | Action | Time | Status | Info |',
		'| :-: | :----- | ---: | :----- | :--- |',
	];
	const overflowRows: string[] = [];

	markdown.push(...tableHeaders);

	report.actions.forEach((action, index) => {
		const comments: string[] = [];

		if (isFlaky(action)) {
			comments.push('**FLAKY**');
		}

		if (action.attempts && action.attempts.length > 1) {
			comments.push(`${action.attempts.length} attempts`);
		}

		if (isSlow(action, slowThreshold)) {
			comments.push('**SLOW**');
		}

		const row = `| ${getIconForStatus(action.status)} | \`${action.label}\` | ${formatDuration(
			action.duration,
		)} | ${action.status} | ${comments.join(', ')} |`;

		if (index < limit) {
			markdown.push(row);
		} else {
			overflowRows.push(row);
		}
	});

	if (overflowRows.length > 0) {
		markdown.push(
			`| | And ${overflowRows.length} more... | | | |`,
			...createDetailsSection('Expanded report', [...tableHeaders, ...overflowRows]),
		);
	}

	// ENVIRONMENT

	const envVars = getMoonEnvVars();

	if (matrixData || envVars) {
		const section = [
			`**OS:** ${process.env.NODE_ENV === 'test' ? 'Test' : process.env.RUNNER_OS ?? 'unknown'}`,
		];

		if (matrixData) {
			section.push('**Matrix:**', ...createCodeBlock(matrixData));
		}

		if (envVars) {
			section.push('**Variables:**', ...createCodeBlock(envVars));
		}

		markdown.push(...createDetailsSection('Environment', section));
	}

	// TOUCHED FILES

	const { touchedFiles } = report.context;

	if (touchedFiles.length > 0) {
		markdown.push(
			...createDetailsSection(
				'Touched files',
				createCodeBlock(touchedFiles.map((file) => `${file.replace(workspaceRoot, '')}`).sort()),
			),
		);
	}

	return markdown.join('\n');
}

export function sortReport(report: RunReport, sortBy: string, sortDir: string) {
	const isAsc = sortDir === 'asc';
	let hasLogged = false;

	report.actions.sort((a, d) => {
		switch (sortBy) {
			case 'time': {
				const at: Duration = a.duration ?? { nanos: 0, secs: 0 };
				const dt: Duration = d.duration ?? { nanos: 0, secs: 0 };
				const am = at.secs * 1000 + at.nanos / 1_000_000;
				const dm = dt.secs * 1000 + dt.nanos / 1_000_000;

				return isAsc ? am - dm : dm - am;
			}

			case 'label': {
				const al = a.label ?? '';
				const dl = d.label ?? '';

				return isAsc ? al.localeCompare(dl) : dl.localeCompare(al);
			}

			default: {
				if (!hasLogged) {
					hasLogged = true;
					core.debug(`Unknown sort by field "${sortBy}".`);
				}

				return 0;
			}
		}
	});
}
