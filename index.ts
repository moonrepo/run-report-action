/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { sortReport } from '@moonrepo/report';
import type { RunReport } from '@moonrepo/types';
import { formatReportToMarkdown, getCommentToken } from './helpers';

function loadReport(workspaceRoot: string): RunReport | null {
	for (const fileName of ['ciReport.json', 'runReport.json']) {
		const reportPath = path.join(workspaceRoot, '.moon/cache', fileName);

		core.debug(`Finding run report at ${reportPath}`);

		if (fs.existsSync(reportPath)) {
			core.debug('Found!');

			return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RunReport;
		}
	}

	return null;
}

async function saveComment(accessToken: string, markdown: string) {
	const {
		payload: { pull_request: pr, issue },
		repo,
	} = github.context;

	let id = pr?.number ?? issue?.number;

	const octokit = github.getOctokit(accessToken);

	if (!id) {
		core.debug(
			'No pull request or issue found from context, trying to find pull requests associated with commit',
		);

		const { data: pullRequests } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
			...repo,
			commit_sha: github.context.sha,
		});

		id = pullRequests[0]?.number;
	}

	if (!id) {
		core.warning('No pull request or issue found, will not add a comment.');
		return;
	}

	const { data: comments } = await octokit.rest.issues.listComments({
		...repo,
		issue_number: id,
	});

	const commentToken = getCommentToken();
	const existingComment = comments.find((comment) => comment.body?.includes(commentToken));

	if (existingComment) {
		core.debug(`Updating existing comment #${existingComment.id}`);

		await octokit.rest.issues.updateComment({
			...repo,
			body: markdown,
			comment_id: existingComment.id,
		});
	} else {
		core.debug('Creating a new comment');

		await octokit.rest.issues.createComment({
			...repo,
			body: markdown,
			issue_number: id,
		});
	}

	core.debug(`Comment body:\n\n${markdown}`);
}

async function saveSummary(markdown: string) {
	await core.summary.addRaw(markdown).write();
}

async function run() {
	try {
		const accessToken = core.getInput('access-token');
		const limit = Number(core.getInput('limit'));
		const skipComment = core.getBooleanInput('skip-comment');
		const slowThreshold = Number(core.getInput('slow-threshold'));
		const workspaceRoot =
			core.getInput('workspace-root') || process.env.GITHUB_WORKSPACE || process.cwd();

		core.debug(`Using workspace root ${workspaceRoot}`);

		if (!accessToken) {
			throw new Error('An `access-token` input is required.');
		}

		const report = loadReport(workspaceRoot);

		// `moon ci` may have run, but nothing may be affected,
		// so instead of throwing an error, just log a message.
		if (!report) {
			core.warning('Run report does not exist, has `moon ci` or `moon run` ran?');
			return;
		}

		// Sort the actions in the report
		const sortBy = core.getInput('sort-by');
		const sortDir = core.getInput('sort-dir') || 'desc';

		if (sortBy) {
			sortReport(report, sortBy as 'time', sortDir as 'desc');
		}

		// Format the report into markdown
		const markdown = formatReportToMarkdown(report, { limit, slowThreshold, workspaceRoot });
		core.setOutput('report', markdown);

		if (skipComment) {
			core.debug('Skipping comment creation');
		} else {
			// Create the comment (does not work in forks)
			try {
				await saveComment(accessToken, markdown);
			} catch (error: unknown) {
				core.warning(String(error));
				core.notice('\nFailed to create comment on pull request. Perhaps this is ran in a fork?\n');
				core.info(markdown);
			}
		}

		// Create an action summary (does work in forks)
		await saveSummary(markdown);

		core.setOutput('comment-created', skipComment ? 'false' : 'true');
	} catch (error: unknown) {
		core.setOutput('comment-created', 'false');
		core.setFailed((error as Error).message);
	}
}

void run();
