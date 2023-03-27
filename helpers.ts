import * as core from '@actions/core';
import * as github from '@actions/github';
import { formatDuration, getDurationInMillis, prepareReportActions } from '@moonrepo/report';
import type { ActionStatus, Duration, RunReport } from '@moonrepo/types';

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

export function getMoonEnvVars() {
	const env: Record<string, string> = {};
	let count = 0;

	Object.entries(process.env).forEach(([key, value]) => {
		if ((key.startsWith('MOON_') || key.startsWith('PROTO_')) && value) {
			env[key] = value;
			count += 1;
		}
	});

	if (count === 0) {
		return null;
	}

	return env;
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
	comparisonEstimate,
}: RunReport): string {
	const parts = [`Total time: ${formatDuration(duration)}`];

	if (comparisonEstimate) {
		parts.push(`Comparison time: ${formatDuration(comparisonEstimate.duration)}`);

		if (comparisonEstimate.percent !== 0) {
			if (comparisonEstimate.percent > 0 && comparisonEstimate.gain) {
				parts.push(
					`Estimated savings: ${formatDuration(
						comparisonEstimate.gain,
					)} (${comparisonEstimate.percent.toFixed(1)}% faster)`,
				);
			} else if (comparisonEstimate.percent < 0 && comparisonEstimate.loss) {
				parts.push(
					`Estimated loss: ${formatDuration(comparisonEstimate.loss)} (${Math.abs(
						comparisonEstimate.percent,
					).toFixed(1)}% slower)`,
				);
			}
		}
	} else if (projectedDuration) {
		parts.push(`Projected time: ${formatDuration(projectedDuration)}`);

		if (estimatedSavings) {
			const percent = calculateSavingsPercentage(projectedDuration, estimatedSavings);

			if (percent !== 0) {
				if (percent > 0) {
					parts.push(
						`Estimated savings: ${formatDuration(estimatedSavings)} (${percent}% decrease)`,
					);
				} else {
					parts.push(
						`Estimated loss: ${formatDuration(estimatedSavings)} (${Math.abs(percent)}% increase)`,
					);
				}
			}
		}
	}

	return parts.join(' | ');
}

function formatStatusLabel(status: ActionStatus): string {
	switch (status) {
		case 'cached':
		case 'cached-from-remote':
			return 'Cached';
		case 'failed':
		case 'failed-and-abort':
			return 'Failed';
		case 'invalid':
			return 'Invalid';
		case 'passed':
			return 'Passed';
		case 'skipped':
			return 'Skipped';
		default:
			return 'Running';
	}
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

	prepareReportActions(report, slowThreshold).forEach((action, index) => {
		const row = `| ${action.icon} | \`${action.label}\` | ${action.time} | ${formatStatusLabel(
			action.status,
		)} | ${action.comments.join(', ')} |`;

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
