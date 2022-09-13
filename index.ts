import core from '@actions/core';
import path from 'path';
import fs from 'fs';
import type { RunReport } from '@moonrepo/types';
import { formatReportToMarkdown } from './helpers';

function loadReport(workspaceRoot: string): RunReport | null {
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
		process.exit(0);
	}

	const markdown = formatReportToMarkdown(report);
} catch (error) {
	core.setFailed((error as Error).message);
}
