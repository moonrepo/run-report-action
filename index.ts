import core from '@actions/core';
import path from 'path';
import fs from 'fs';

const reportPath = path.join(process.cwd(), '.moon/cache/ciReport.json');

function loadReport() {}

function formatReportToMarkdown() {}

try {
	if (!fs.existsSync(reportPath)) {
		core.debug('Run report does not exist, has `moon ci` ran?');
		process.exit(0);
	}

	const report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8')) as Report;
} catch (error) {
	core.setFailed((error as Error).message);
}
