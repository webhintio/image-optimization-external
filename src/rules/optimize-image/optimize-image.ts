/**
 * @fileoverview Optimize images.
 */

import { Category } from 'sonarwhal/dist/src/lib/enums/category';
import { RuleContext } from 'sonarwhal/dist/src/lib/rule-context';
import { IRule, IRuleBuilder, IScanEnd, ITargetFetchStart } from 'sonarwhal/dist/src/lib/types';
import { debug as d } from 'sonarwhal/dist/src/lib/utils/debug';

import { Result, File, Bytes } from './types';

const debug: debug.IDebugger = d(__filename);

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

const rule: IRuleBuilder = {
    create(context: RuleContext): IRule {
        /** Error processing the request. */
        let failed: boolean = false;
        /** The promise that represents the analyzing result. */
        let analyzePromise: Promise<Result>;

        const username: string = process.env.SERVICE_USERNAME; // eslint-disable-line no-process-env
        const endpoint: string = process.env.API_ENDPOINT; // eslint-disable-line no-process-env
        const requestAsync = require('request-promise');

        const notifyError = async (resource: string, error: any) => {
            debug(`Error getting analyzing result for ${resource}.`, error);

            await context.report(resource, null, `Couldn't get results for ${resource}. Error: ${error.message}`);
        };

        const validateTargetFetchStart = (targetFetchStart: ITargetFetchStart) => {
            const { resource }: { resource: string } = targetFetchStart;

            debug(`Validating rule.`);

            if (!username) {
                notifyError(resource, new Error('No username is provided for authentication.'));
                failed = true;

                return;
            }

            const options = {
                auth: { user: username },
                body: { url: resource },
                json: true,
                method: 'POST',
                uri: endpoint
            };

            analyzePromise = requestAsync(options);
            analyzePromise.catch(async (error) => {
                failed = true;

                await notifyError(resource, error);
            });
        };

        const valiateScanEnd = async (fetchEnd: IScanEnd) => {
            const { resource }: { resource: string } = fetchEnd;

            if (!analyzePromise || failed) {
                return;
            }

            debug(`Waiting for the optimizing result of ${resource}.`);

            const result: Result = await analyzePromise;

            debug(`Received the optimizing result of ${resource}.`);

            const { files }: { files: Array<File> } = result;
            const unoptimized: Array<File> = files.filter((file) => {
                if (!file) {
                    return false;
                }

                const { bytes }: { bytes: Bytes } = file;

                return bytes.output < bytes.input;
            });

            if (!unoptimized.length) {
                debug(`All images are optimized.`);

                return;
            }

            const reportPromises: Array<Promise<void>> = unoptimized.map((file) => {
                const { bytes }: { bytes: Bytes } = file;
                const sizeDiff: number = bytes.savings / 1024;
                const percentageDiff: number = Math.round((bytes.savings / bytes.input) * 100);

                return context.report(file.url, null, `File "${file.name}" can be ${sizeDiff.toFixed(2)}kB (${percentageDiff}%) smaller.`);
            });

            await Promise.all(reportPromises);
        };

        return {
            'scan::end': valiateScanEnd,
            'targetfetch::start': validateTargetFetchStart
        };
    },
    meta: {
        docs: {
            category: Category.performance,
            description: `Optimize images.`
        },
        recommended: false,
        schema: [],
        worksWithLocalFiles: false
    }
};

module.exports = rule;
