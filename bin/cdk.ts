#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkStack } from '../lib/cdk-stack';

const app = new cdk.App();
new CdkStack(app, "InsCdkStack", {
    env: { account: "710626597572", region: "ap-northeast-1" }
});
