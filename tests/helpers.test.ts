import { formatReportToMarkdown } from '../helpers';

describe('formatReportToMarkdown()', () => {
	it('renders a standard report', () => {
		expect(formatReportToMarkdown(require('./__fixtures__/standard.json'))).toMatchSnapshot();
	});
});
