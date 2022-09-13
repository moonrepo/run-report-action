import { formatReportToMarkdown } from '../helpers';

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
});
