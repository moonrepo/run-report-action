import type { RunReport, Duration, Action, ActionStatus } from '@moonrepo/types';

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

export function formatDuration(duration: Duration | null): string {
	if (!duration) {
		return '--';
	}

	let millis = (duration.nanos / 1000000).toFixed(1);

	if (millis.endsWith('.0')) {
		millis = millis.slice(0, -2);
	}

	if (duration.secs === 0) {
		return `${millis}ms`;
	}

	let value: string[] = [];
	let mins = 0;
	let secs = duration.secs;

	while (secs > 60) {
		mins += 1;
		secs -= 60;
	}

	if (mins > 0) {
		value.push(`${mins}m`);
	}

	if (secs > 0) {
		value.push(`${secs}s`);
	}

	value.push(`${millis}ms`);

	return value.join(', ');
}

export function formatReportToMarkdown(report: RunReport): string {
	let markdown = [
		'### Run report',
		'|     | Action | Time | Status |    |',
		'| :-: | :----- | ---: | :----- | :- |',
	];

	report.actions.forEach((action) => {
		let comments: string[] = [];

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

	if (report.context.touchedFiles.length > 0) {
		markdown.push('\n', '### Touched files', '<details><summary>View files list</summary><div>');

		report.context.touchedFiles.forEach((file) => {
			markdown.push(`- ${file}`);
		});

		markdown.push('</div></details>');
	}

	return markdown.join('\n');
}
