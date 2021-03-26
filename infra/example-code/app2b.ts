import { App, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'

const stage = 'dev';
// const stage = 'prd';

let prefix = '';
let codeAsseet = '';
let env = {};
if (stage == 'dev') {
    prefix = 'ReviewServiceDev';
    code