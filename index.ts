import core from '@actions/core';
import path from 'path';
import fs from 'fs';
import type { RunReport, Duration, Action, ActionStatus } from '@moonrepo/types';

async function loadReport(workspaceRoot: string): Promise<RunReport | null> {
	for (const fileName in ['ciReport.json', 'runReport.json']) {
		const reportPath = path.join(workspaceRoot, '.moon/cache', fileName);

		if (fs.existsSync(reportPath)) {
			return JSON.parse(await fs.promises.readFile(reportPath, 'utf8')) as RunReport;
		}
	}

	return null;
}

function getIconForStatus(status: ActionStatus): string {
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
			return '⬜️';
	}
}

function hasFailed(status: ActionStatus): boolean {
	return status === 'failed' || status === 'failed-and-abort';
}

function hasPassed(status: ActionStatus): boolean {
	return status === 'passed' || status === 'cached';
}

function isActionFlaky(action: Action): boolean {
	if (!action.attempts || action.attempts.length === 0) {
		return false;
	}

	const someAttemptsFailed = action.attempts.some((attempt) => hasFailed(attempt.status));

	return hasPassed(action.status) && someAttemptsFailed;
}

function formatDuration(duration: Duration | null): string {
	if (!duration) {
		return '--';
	}

	const millis = duration.nanos / 1000000;

	if (duration.secs === 0) {
		return `${millis}ms`;
	}

	let value = [];
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

	if (millis > 0) {
		value.push(`${millis}ms`);
	}

	return value.join(', ');
}

function formatReportToMarkdown(report: RunReport): string {
	let markdown = [
		'### Run report',
		'|     | Action | Time | Status |    |',
		'| :-: | :----- | ---: | :----- | :- |',
	];

	report.actions.forEach((action) => {
		let comments = [];

		if (isActionFlaky(action)) {
			comments.push('**FLAKY**');
		}

		if (action.attempts && action.attempts.length > 0) {
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

try {
	const workspaceRoot = core.getInput('workspace-root') || process.cwd();
	const report = await loadReport(workspaceRoot);

	if (!report) {
		core.debug('Run report does not exist, has `moon ci` ran?');
		process.exit(0);
	}

	const markdown = formatReportToMarkdown(report);
} catch (error) {
	core.setFailed((error as Error).message);
}
