import { describe, it, expect } from 'vitest';
import { parseCsvLine, parseCsv } from './csv';

describe('parseCsvLine', () => {
	it('splits a simple line', () => {
		expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
	});

	it('respects quoted commas', () => {
		expect(parseCsvLine('"Smith, John",612,"Acme, Inc"')).toEqual([
			'Smith, John', '612', 'Acme, Inc',
		]);
	});

	it('unescapes doubled quotes', () => {
		expect(parseCsvLine('"she said ""hi""",x')).toEqual(['she said "hi"', 'x']);
	});

	it('keeps empty trailing fields', () => {
		expect(parseCsvLine('a,,c,')).toEqual(['a', '', 'c', '']);
	});
});

describe('parseCsv', () => {
	it('parses a multi-row document with CRLF and a quoted newline-free body', () => {
		const csv = 'name,phone\r\n"Doe, Jane",6125550123\r\nBob,6125550124\r\n';
		expect(parseCsv(csv)).toEqual([
			['name', 'phone'],
			['Doe, Jane', '6125550123'],
			['Bob', '6125550124'],
		]);
	});

	it('drops blank lines', () => {
		expect(parseCsv('a,b\n\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
	});
});
