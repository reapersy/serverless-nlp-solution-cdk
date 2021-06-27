/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

import { BaseConstruct, ConstructCommonProps } from '../base/base-construct';

export interface LambdaSimplePatternProps extends ConstructCommonProps {
    baseName: string;
    lambdaPath: string;
    policies: string[] | iam.PolicyStatement[];
    handler?: string;
    environments?: any;
    timeout?: cdk.Duration;
    bucket?: s3.Bucket;
    layerArns?: string[];
    bucketPrefix?: string[];
    bucketSuffix?: string[];
}

export class LambdaSimplePattern extends BaseConstruct {
    public readonly lambdaFunction: lambda.Function;
    public readonly lambdaRole: iam.Role;

    constructor(scope: Construct, id: string, props: LambdaSimplePatternProps) {
        super(scope, id, props);

        const lambdaName: string = `${props.projectPrefix}-${props.baseName}-Lambda`;
        const roleName: string = `${props.projectPrefix}-${props.baseName}-Lambda-Role`;

        this.lambdaRole = this.createRole(roleName, props.policies);
        this.lambdaFunction = this.createLambda(lambdaName, props.lambdaPath, this.lambdaRole, props);
    }

    private createLambda(lambdaName: string, lambdaPath: string, lambdaRole: iam.Role, props: LambdaSimplePatternProps): lambda.Function {
   