import * as core from '@actions/core';
import * as github from '@actions/github';
import { sortReport } from '@moonrepo/report';
import type { RunReport } from '@moonrepo/types';
import {
	createCodeBlock,
	formatReportToMarkdown,
	MAX_LISTED_FILES,
	prepareFileList,
} from '../helpers';

jest.mock('@actions/github', () => ({
	context: { payload: {}, serverUrl: 'https://github.com' },
}));

const options = {
	limit: 20,
	slowThreshold: 60,
	workspaceRoot: '',
};

describe('formatReportToMarkdown()', () => {
	it('renders a standard report', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/standard.json'), options),
		).toMatchSnapshot();
	});

	it('renders a standard report with touched files', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/standard-touched-files.json'), options),
		).toMatchSnapshot();
	});

	it('renders durations', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/durations.json'), options),
		).toMatchSnapshot();
	});

	it('renders attempts and flakiness', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/flakiness.json'), options),
		).toMatchSnapshot();
	});

	it('renders errors', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/errors.json'), options),
		).toMatchSnapshot();
	});

	it('renders comparison estimate', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/estimate.json'), options),
		).toMatchSnapshot();
	});

	it('renders with git commit', () => {
		Object.assign(github.context, {
			sha: '59719f967ddcf585da9bc7ba8730dcd2865cbdfa',
			repo: {
				owner: 'moonrepo',
				repo: 'moon',
			},
			payload: {
				pull_request: {
					number: '123',
				},
			},
		});

		expect(
			formatReportToMarkdown(require('./__fixtures__/standard.json'), options),
		).toMatchSnapshot();

		// @ts-expect-error Allow override
		delete github.context.sha;
	});

	it('renders with matrix data', () => {
		const spy = jest
			.spyOn(core, 'getInput')
			.mockImplementation(() => JSON.stringify({ os: 'ubuntu-latest', 'node-version': 16 }));

		expect(
			formatReportToMarkdown(require('./__fixtures__/standard.json'), options),
		).toMatchSnapshot();

		spy.mockRestore();
	});

	it('renders with a limit', () => {
		expect(
			formatReportToMarkdown(require('./__fixtures__/durations.json'), { ...options, limit: 3 }),
		).toMatchSnapshot();
	});
});

describe('sortReport()', () => {
	it('sorts by time', () => {
		const report = require('./__fixtures__/standard.json') as RunReport;

		sortReport(report, 'time', 'desc');

		expect(formatReportToMarkdown(report, options)).toMatchSnapshot();
	});

	it('sorts by label', () => {
		const report = require('./__fixtures__/standard.json') as RunReport;

		sortReport(report, 'label', 'asc');

		expect(formatReportToMarkdown(report, options)).toMatchSnapshot();
	});
});

/** Must stay above V8's call-argument cap (between 125k and 200k) to exercise the overflow. */
const HUGE_FILE_COUNT = 211_673;

function reportWithChangedFiles(count: number): RunReport {
	const base = require('./__fixtures__/standard.json') as RunReport;
	const report: RunReport = {
		...base,
		context: {
			...base.context,
			changedFiles: Array.from(
				{ length: count },
				(_, index) => `/workspace/packages/example/src/file${index}.ts`,
			),
		},
	};

	return report;
}

describe('prepareFileList()', () => {
	it('sorts and makes paths relative to the workspace root', () => {
		expect(prepareFileList(['/root/z.ts', '/root/a.ts', '/root/m.ts'], '/root')).toEqual([
			'/a.ts',
			'/m.ts',
			'/z.ts',
		]);
	});

	it('leaves a list that fits untouched', () => {
		const files = Array.from({ length: MAX_LISTED_FILES }, (_, index) => `/f${index}.ts`);

		expect(prepareFileList(files, '')).toHaveLength(MAX_LISTED_FILES);
	});

	it('caps a longer list and says how many were left out', () => {
		const result = prepareFileList(
			Array.from({ length: MAX_LISTED_FILES + 5 }, (_, index) => `/f${index}.ts`),
			'',
		);

		expect(result).toHaveLength(MAX_LISTED_FILES + 1);
		expect(result[result.length - 1]).toBe('… and 5 more');
	});

	it('caps the alphabetical head, not moon\'s emission order', () => {
		const result = prepareFileList(['/z.ts', '/a.ts'], '');

		expect(result[0]).toBe('/a.ts');
	});
});

describe('createCodeBlock()', () => {
	it('fences an array too large to spread into a call', () => {
		// `code.push(...map)` cannot survive this length.
		expect(() =>
			createCodeBlock(Array.from({ length: HUGE_FILE_COUNT }, (_, i) => `f${i}.ts`)),
		).not.toThrow();
	});
});

describe('formatReportToMarkdown() with a very large changed files list', () => {
	it('does not throw a max call stack error', () => {
		expect(() =>
			formatReportToMarkdown(reportWithChangedFiles(HUGE_FILE_COUNT), {
				...options,
				workspaceRoot: '/workspace',
			}),
		).not.toThrow();
	});

	it('caps the rendered list', () => {
		const markdown = formatReportToMarkdown(reportWithChangedFiles(HUGE_FILE_COUNT), {
			...options,
			workspaceRoot: '/workspace',
		});

		expect(markdown).toContain('Changed files');
		expect(markdown).toContain(`… and ${HUGE_FILE_COUNT - MAX_LISTED_FILES} more`);
	});

	it('keeps the comment small enough to post', () => {
		// Not throwing is only half of it: rendering every path would produce
		// roughly ten megabytes of comment body.
		const markdown = formatReportToMarkdown(reportWithChangedFiles(HUGE_FILE_COUNT), {
			...options,
			workspaceRoot: '/workspace',
		});

		expect(markdown.length).toBeLessThan(20_000);
	});
});
