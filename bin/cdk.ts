#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkStack } from '../lib/cdk-stack';

import o from '../utils/setting.json';

const app = new cdk.App();
// new CdkStack(app, "InsCdkStack", {
//     env: { account: "710626597572", region: "ap-northeast-1" }
// });
new CdkStack(app, o.stack_name, {
    env: { account: o.account_id, region: o.region }
});
