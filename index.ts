import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import type { RunReport } from '@moonrepo/types';
import { COMMENT_TOKEN, formatReportToMarkdown, sortReport } from './helpers';

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

async function saveComment(accessToken: string, commentBody: string) {
	const {
		payload: { pull_request: pr, issue },
		repo,
	} = github.context;
	const id = pr?.number ?? issue?.number;

	if (!id) {
		core.warning('No pull request or issue found, will not add a comment.');
		return;
	}

	const octokit = github.getOctokit(accessToken);

	const { data: comments } = await octokit.rest.issues.listComments({
		...repo,
		issue_number: id,
	});

	const existingComment = comments.find((comment) => comment.body?.includes(COMMENT_TOKEN));

	if (existingComment) {
		core.debug(`Updating existing comment #${existingComment.id}`);

		await octokit.rest.issues.updateComment({
			...repo,
			body: commentBody,
			comment_id: existingComment.id,
		});
	} else {
		core.debug('Creating a new comment');

		await octokit.rest.issues.createComment({
			...repo,
			body: commentBody,
			issue_number: id,
		});
	}
}

async function run() {
	try {
		const accessToken = core.getInput('access-token');
		const workspaceRoot = core.getInput('workspace-root') || process.cwd();

		if (!accessToken) {
			throw new Error('An `access-token` input is required.');
		}

		const report = loadReport(workspaceRoot);

		if (!report) {
			core.info('Run report does not exist, has `moon ci` ran?');
			return;
		}

		// Sort the actions in the report
		const sortBy = core.getInput('sort-by');
		const sortDir = core.getInput('sort-dir') || 'desc';

		if (sortBy) {
			sortReport(report, sortBy, sortDir);
		}

		// Format the report into markdown
		const markdown = formatReportToMarkdown(report);

		// Create the comment
		await saveComment(accessToken, markdown);

		core.setOutput('comment-created', 'true');
	} catch (error: unknown) {
		core.setOutput('comment-created', 'false');
		core.setFailed((error as Error).message);
	}
}

void run();
