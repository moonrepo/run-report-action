import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import type { RunReport } from '@moonrepo/types';
import { formatReportToMarkdown, sortReport } from './helpers';

function loadReport(workspaceRoot: string): RunReport | null {
	// eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in
	for (const fileName in ['ciReport.json', 'runReport.json']) {
		const reportPath = path.join(workspaceRoot, '.moon/cache', fileName);

		if (fs.existsSync(reportPath)) {
			return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RunReport;
		}
	}

	return null;
}

try {
	const workspaceRoot = core.getInput('workspace-root') || process.cwd();
	const report = loadReport(workspaceRoot);

	if (!report) {
		core.debug('Run report does not exist, has `moon ci` ran?');

		// eslint-disable-next-line no-process-exit, unicorn/no-process-exit
		process.exit(0);
	}

	// Sort the actions in the report
	const sortBy = core.getInput('sort-by');
	const sortDir = core.getInput('sort-dir') || 'desc';

	if (sortBy) {
		sortReport(report, sortBy, sortDir);
	}

	// Format the report into markdown
	const markdown = formatReportToMarkdown(report);
} catch (error: unknown) {
	core.setFailed((error as Error).message);
}
