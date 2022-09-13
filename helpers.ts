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

export function formatTime(mins: number, secs: number, millis: number): string {
	if (mins === 0 && secs === 0 && millis === 0) {
		return '0s';
	}

	const value: string[] = [];

	if (mins > 0) {
		value.push(`${mins}m`);
	}

	if (secs > 0) {
		value.push(`${secs}s`);
	}

	if (millis > 0) {
		let ms = millis.toFixed(1);

		if (ms.endsWith('.0')) {
			ms = ms.slice(0, -2);
		}

		value.push(`${ms}ms`);
	}

	return value.join(', ');
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

	while (secs > 60) {
		mins += 1;
		secs -= 60;
	}

	return formatTime(mins, secs, millis);
}

export function calculateTotalTime(report: RunReport): string {
	let mins = 0;
	let secs = 0;
	let millis = 0;

	report.actions.forEach((action) => {
		if (action.duration) {
			secs += action.duration.secs;
			millis += action.duration.nanos / 1_000_000;
		}
	});

	while (millis > 1000) {
		secs += 1;
		millis -= 1000;
	}

	while (secs > 60) {
		mins += 1;
		secs -= 60;
	}

	return formatTime(mins, secs, 0);
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
		'<details><summary>',
		'',
		`### ${title}`,
		'',
		'</summary><div>',
		'',
		...body,
		'',
		'</div></details>',
	];
}

export function formatReportToMarkdown(report: RunReport, root: string = ''): string {
	const commit = getCommitInfo();
	const matrix = core.getInput('matrix');
	const matrixData = matrix ? (JSON.parse(matrix) as Record<string, unknown>) : null;

	const markdown = [
		getCommentToken(),
		'',
		commit ? `### Run report for [${commit.sha.slice(0, 8)}](${commit.url})` : '### Run report',
		'|     | Action | Time | Status | Info |',
		'| :-: | :----- | ---: | :----- | :--- |',
	];

	if (matrixData) {
		markdown[2] += ` \`(${Object.values(matrixData).join(', ')})\``;
	}

	// ACTIONS

	report.actions.forEach((action) => {
		const comments: string[] = [];

		if (isFlaky(action)) {
			comments.push('**FLAKY**');
		}

		if (action.attempts && action.attempts.length > 1) {
			comments.push(`${action.attempts.length} attempts`);
		}

		if (hasFailed(action.status) && action.error) {
			comments.push(action.error);
		}

		markdown.push(
			`| ${getIconForStatus(action.status)} | \`${action.label}\` | ${formatDuration(
				action.duration,
			)} | ${action.status} | ${comments.join(', ')} |`,
		);
	});

	markdown.push(`| | | ${calculateTotalTime(report)} | | |`);

	// ENVIRONMENT

	const envVars = getMoonEnvVars();

	if (matrixData || envVars) {
		const section = [`**OS:** ${process.env.RUNNER_OS ?? 'unknown'}`];

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
				createCodeBlock(touchedFiles.map((file) => `${file.replace(root, '')}`).sort()),
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
