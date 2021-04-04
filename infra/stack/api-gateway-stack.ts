import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag'

import { wrapManagedRuleSet } from "@aws-solutions-constructs/core";
import { WafwebaclToApiGateway } from "@aws-solutions-constructs/aws-wafwebacl-apigateway";
import { CognitoToApiGatewayToLambda } from "@aws-solutions-constructs/aws-cognito-apigateway-lambda";

import * as base from '../../lib/template/stack/base/base-stack';
import { AppContext } from '../../lib/template/app-context';
import { StackConfig } from '../../lib/template/app-config';


interface ResourceMapping {
    ResourceName: string;
    LambdaFuncName: string;
    Methods: string[];
}

interface ApiConfig {
    ApiGatewayName: string;
    ResourceMapping: ResourceMapping[];
}

interface CognitoConfig {
    CognitoUserPoolName: string;
}

interface WafConfig {
    WebAclName: string;
    WafAwsManagedRules: string[];
}

export interface ApiGatewayStackConfig extends StackConfig {
    ApiConfig: ApiConfig;
    CognitoConfig: CognitoConfig;
    WafConfig: WafConfig;
}

export class ApiGatewayStack extends base.BaseStack {
    private credentialRole: iam.Role;

    constructor(appContext: AppContext, stackConfig: ApiGatewayStackConfig) {
        super(appContext, stackConfig);

        const apiConfig = stackConfig.ApiConfig;
        const cognitoConfig = stackConfig.CognitoConfig;
        const wafConfig = stackConfig.WafConfig;

        const apiLambda = new CognitoToApiGatewayToLambda(this, 'apigateway-cognito-lambda', {
            apiGatewayProps: {
                restApiName: this.withStackName(apiConfig.ApiGatewayName),
                endpointConfiguration: {
                    types: [apigateway.EndpointType.REGIONAL]
                },
                proxy: false,
                deployOptions: {
                    loggingLevel: apigateway.MethodLoggingLevel.ERROR,
                },
            },
            cognitoUserPoolProps: {
                userPoolName: this.withStackName(cognitoConfig.CognitoUserPoolName),
                passwordPolicy: {
                    requireSymbols: true,
                    minLength: 8,
                    requireUppercase: true,
                    requireDigits: true
                }
            },
            cognitoUserPoolClientProps: {
                authFlows: {
                    userPassword: true,
