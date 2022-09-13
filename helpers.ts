import type { Action, ActionStatus, Duration, RunReport } from '@moonrepo/types';

export function getCommitInfo() {
	const sha = process.env.GITHUB_SHA;
	const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
	const repo = process.env.GITHUB_REPOSITORY;

	if (!sha || !repo) {
		return null;
	}

	const pr = /refs\/pull\/(\d+)\//g.exec(process.env.GITHUB_REF!);

	if (pr?.[1]) {
		return {
			sha,
			url: `${server}/${repo}/pull/${pr[1]}/commits/${sha}`,
		};
	}

	return {
		sha,
		url: `${server}/${repo}/commit/${sha}`,
	};
}

export function getIconForStatus(status: ActionStatus): string {
	switch (status) {
		case 'cached':
			return '🟪';
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

	const someAttemptsFailed = action.attempts.some((attempt) => hasFailed(attempt.status));

	return hasPassed(action.status) && someAttemptsFailed;
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

export function formatReportToMarkdown(report: RunReport): string {
	const markdown = [
		'### Run report',
		'|     | Action | Time | Status |    |',
		'| :-: | :----- | ---: | :----- | :- |',
	];

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

	if (report.context.touchedFiles.length > 0) {
		markdown.push('', '### Touched files', '<details><summary>View files list</summary><div>\n');

		report.context.touchedFiles.forEach((file) => {
			markdown.push(`- ${file}`);
		});

		markdown.push('\n</div></details>');
	}

	const commit = getCommitInfo();

	if (commit) {
		markdown.push(
			'',
			`<small>Run report for commit [${commit.sha.slice(0, 7)}](${commit.url})</small>`,
		);
	}

	return markdown.join('\n');
}
