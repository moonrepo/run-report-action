import * as github from '@actions/github';
import type { RunReport } from '@moonrepo/types';
import { formatReportToMarkdown, sortReport } from '../helpers';

jest.mock('@actions/github', () => ({
	context: { payload: {} },
}));

describe('formatReportToMarkdown()', () => {
	it('renders a standard report', () => {
		expect(formatReportToMarkdown(require('./__fixtures__/standard.json'))).toMatchSnapshot();
	});

	it('renders a standard report with touched files', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/standard-touched-files.json')),
		).toMatchSnapshot();
	});

	it('renders durations', () => {
		expect(formatReportToMarkdown(require('./__fixtures__/durations.json'))).toMatchSnapshot();
	});

	it('renders attempts and flakiness', () => {
		expect(formatReportToMarkdown(require('./__fixtures__/flakiness.json'))).toMatchSnapshot();
	});

	it('renders errors', () => {
		expect(formatReportToMarkdown(require('./__fixtures__/errors.json'))).toMatchSnapshot();
	});

	it('renders with git commit', () => {
		Object.assign(github.context, {
			sha: '59719f967ddcf585da9bc7ba8730dcd2865cbdfa',
			payload: {
				pull_request: {
					number: '123',
				},
			},
		});

		process.env.GITHUB_REPOSITORY = 'moonrepo/moon';

		expect(formatReportToMarkdown(require('./__fixtures__/standard.json'))).toMatchSnapshot();

		delete process.env.GITHUB_REPOSITORY;
	});
});

describe('sortReport()', () => {
	it('sorts by time', () => {
		const report = require('./__fixtures__/standard.json') as RunReport;

		sortReport(report, 'time', 'desc');

		expect(formatReportToMarkdown(report)).toMatchSnapshot();
	});

	it('sorts by label', () => {
		const report = require('./__fixtures__/standard.json') as RunReport;

		sortReport(report, 'label', 'asc');

		expect(formatReportToMarkdown(report)).toMatchSnapshot();
	});
});
