import { generateHTMLPage } from 'sonarwhal/dist/tests/helpers/misc';
import { getRuleName } from 'sonarwhal/dist/src/lib/utils/rule-helpers';
import { IRuleTest } from 'sonarwhal/dist/tests/helpers/rule-test-type';

import * as ruleRunner from 'sonarwhal/dist/tests/helpers/rule-runner';
import * as mock from 'mock-require';

const ruleName = getRuleName(__dirname);
const notOptimizedImage = {
    bytes: {
        input: 4054,
        output: 2835,
        savings: 1219
    },
    depth: 32,
    format: `PNG`,
    height: 46,
    name: `bigImage.png`,
    url: `https://example.com/images/bigImage.png`,
    width: 216
};
const optimizedImage = {
    bytes: {
        input: 465,
        output: 465,
        savings: 0
    },
    format: `SVG`,
    name: `optimizedImage.svg`,
    url: `https://example.com/images/optimizedImage.svg`
};

const summaryWrapper = (files) => {
    const result = {
        files: null,
        summary: null
    };
    const bytes = files.reduce((sum, file) => {
        sum.input += file.bytes.input;
        sum.output += file.bytes.output;
        sum.savings += file.bytes.savings;

        return sum;
    }, { input: 0, output: 0, savings: 0 });

    result.summary = {
        bytes,
        images: files.length
    };

    result.files = files;

    return result;
};

const allOptimizedResult = summaryWrapper([optimizedImage]);
const canBeOptimizedResult = summaryWrapper([optimizedImage, notOptimizedImage]);

const messages = {
    canBeOptimized: `File "bigImage.png" can be 1.22kB (30%) smaller.`,
    error: `Couldn't get results for http://localhost/. Error: Error with optimizing images.`
};

const mockRequestJSON = (response?) => {
    const mockedRequestJSON = () => {
        if (!response) {
            return Promise.reject(new Error(`Error with optimizing images.`));
        }

        return Promise.resolve(response);
    };

    mock('request-promise', mockedRequestJSON);
    process.env.SERVICE_USERNAME = 'test'; // eslint-disable-line no-process-env
};

const tests: Array<IRuleTest> = [
    {
        before() {
            mockRequestJSON();
        },
        name: 'Submit data to the api endpoint throws an error',
        reports: [{ message: messages.error }],
        serverConfig: generateHTMLPage()
    },
    {
        before() {
            mockRequestJSON(canBeOptimizedResult);
        },
        name: `One of the two images is not optimized`,
        reports: [{ message: messages.canBeOptimized }],
        serverConfig: generateHTMLPage()
    },
    {
        before() {
            mockRequestJSON(allOptimizedResult);
        },
        name: `All images are optimized`,
        serverConfig: generateHTMLPage()
    }
];

ruleRunner.testRule(ruleName, tests, { serial: true });
