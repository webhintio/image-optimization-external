/**
 * @fileoverview Optimize images.
 */

import { Category } from 'sonarwhal/dist/src/lib/enums/category';
import { RuleContext } from 'sonarwhal/dist/src/lib/rule-context';
import { IRule, ScanEnd, FetchEnd, RuleMetadata } from 'sonarwhal/dist/src/lib/types';
import { debug as d } from 'sonarwhal/dist/src/lib/utils/debug';
import { RuleScope } from 'sonarwhal/dist/src/lib/enums/rulescope';

import { Result, File, Bytes } from './types';

const debug: debug.IDebugger = d(__filename);

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

export default class OptimizeImageRule implements IRule {

    public static readonly meta: RuleMetadata = {
        docs: {
            category: Category.performance,
            description: `Optimize images.`
        },
        id: 'optimize-image',
        schema: [],
        scope: RuleScope.site
    }

    /** Error processing the request. */
    private failed: boolean = false;
    /** The promise that represents the analyzing result. */
    private analyzePromise: Promise<Result>;

    private username: string = process.env.SERVICE_USERNAME; // eslint-disable-line no-process-env
    private endpoint: string = process.env.API_ENDPOINT; // eslint-disable-line no-process-env

    private context: RuleContext;

    private async notifyError(resource: string, error: any) {
        debug(`Error getting analyzing result for ${resource}.`, error);

        await this.context.report(resource, null, `Couldn't get results for ${resource}. Error: ${error.message}`);
    }

    private validateTargetFetchStart(targetFetchStart: FetchEnd) {
        const requestAsync = require('request-promise');
        const { resource }: { resource: string } = targetFetchStart;

        debug(`Validating rule.`);

        if (!this.username) {
            this.notifyError(resource, new Error('No username is provided for authentication.'));
            this.failed = true;

            return;
        }

        const options = {
            auth: { user: this.username },
            body: { url: resource },
            json: true,
            method: 'POST',
            uri: this.endpoint
        };

        this.analyzePromise = requestAsync(options);
        this.analyzePromise.catch(async (error) => {
            this.failed = true;

            await this.notifyError(resource, error);
        });
    }

    private async valiateScanEnd(fetchEnd: ScanEnd) {
        const { resource }: { resource: string } = fetchEnd;

        if (!this.analyzePromise || this.failed) {
            return;
        }

        debug(`Waiting for the optimizing result of ${resource}.`);

        const result: Result = await this.analyzePromise;

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

            return this.context.report(file.url, null, `File "${file.name}" can be ${sizeDiff.toFixed(2)}kB (${percentageDiff}%) smaller.`);
        });

        await Promise.all(reportPromises);
    }

    public constructor(context: RuleContext) {
        this.context = context;

        context.on('scan::end', this.valiateScanEnd.bind(this));
        context.on('fetch::end::html', this.validateTargetFetchStart.bind(this));
    }
}
