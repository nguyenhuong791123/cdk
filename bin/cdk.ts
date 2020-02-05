#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkStack } from '../lib/cdk-stack';
import o from '../utils/setting.json';

const app = new cdk.App();
new CdkStack(app, o.STACK_NAME, {
    env: { account: o.ACCOUNT_ID, region: o.REGION }
});
